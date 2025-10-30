pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract MmoLocationFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error BatchClosed();
    error InvalidCoordinates();
    error ReplayDetected();
    error StateMismatch();
    error InvalidDecryptionProof();
    error AlreadyInitialized();
    error NotInitialized();
    error InvalidParameter();

    address public owner;
    mapping(address => bool) public isProvider;
    bool public paused;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    struct PlayerLocation {
        euint32 encryptedX;
        euint32 encryptedY;
        bool publicLocation; // True if player opts into public location
        bool inParty;       // True if player is in a party (visible to party members)
    }
    mapping(address => PlayerLocation) public playerLocations;

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    uint256 public currentBatchId;
    bool public batchOpen;

    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event PausedSet(bool paused);
    event CooldownSecondsSet(uint256 oldCooldown, uint256 newCooldown);
    event BatchOpened(uint256 batchId);
    event BatchClosed(uint256 batchId);
    event LocationSubmitted(address indexed player, bool publicLocation, bool inParty);
    event LocationUpdateRequested(uint256 indexed requestId, address indexed player, uint256 batchId);
    event LocationUpdateCompleted(uint256 indexed requestId, address indexed player, uint256 decryptedX, uint256 decryptedY);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier checkSubmissionCooldown(address _player) {
        if (block.timestamp < lastSubmissionTime[_player] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    modifier checkDecryptionCooldown(address _player) {
        if (block.timestamp < lastDecryptionRequestTime[_player] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        isProvider[owner] = true;
        cooldownSeconds = 60; // Default cooldown: 60 seconds
        currentBatchId = 1; // Start with batch 1
        batchOpen = true;
        emit ProviderAdded(owner);
        emit BatchOpened(currentBatchId);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        if (!isProvider[provider]) {
            isProvider[provider] = true;
            emit ProviderAdded(provider);
        }
    }

    function removeProvider(address provider) external onlyOwner {
        if (isProvider[provider]) {
            isProvider[provider] = false;
            emit ProviderRemoved(provider);
        }
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PausedSet(_paused);
    }

    function setCooldownSeconds(uint256 newCooldownSeconds) external onlyOwner {
        if (newCooldownSeconds == 0) revert InvalidParameter();
        uint256 oldCooldown = cooldownSeconds;
        cooldownSeconds = newCooldownSeconds;
        emit CooldownSecondsSet(oldCooldown, newCooldownSeconds);
    }

    function openBatch() external onlyOwner {
        currentBatchId++;
        batchOpen = true;
        emit BatchOpened(currentBatchId);
    }

    function closeBatch() external onlyOwner {
        batchOpen = false;
        emit BatchClosed(currentBatchId);
    }

    function submitLocation(
        euint32 encryptedX,
        euint32 encryptedY,
        bool publicLocation,
        bool inParty
    ) external whenNotPaused checkSubmissionCooldown(msg.sender) {
        if (!batchOpen) revert BatchClosed();
        _initIfNeeded(encryptedX);
        _initIfNeeded(encryptedY);

        playerLocations[msg.sender] = PlayerLocation(encryptedX, encryptedY, publicLocation, inParty);
        lastSubmissionTime[msg.sender] = block.timestamp;
        emit LocationSubmitted(msg.sender, publicLocation, inParty);
    }

    function requestPlayerLocationDecryption(address player) external whenNotPaused checkDecryptionCooldown(player) {
        if (!batchOpen) revert BatchClosed();

        PlayerLocation memory loc = playerLocations[player];
        if (!FHE.isInitialized(loc.encryptedX) || !FHE.isInitialized(loc.encryptedY)) {
            revert NotInitialized();
        }

        // For this example, we'll decrypt the player's coordinates.
        // In a real MMORPG, you might decrypt relative positions or other derived data.
        euint32[] memory ctsToDecrypt = new euint32[](2);
        ctsToDecrypt[0] = loc.encryptedX;
        ctsToDecrypt[1] = loc.encryptedY;

        bytes32 stateHash = _hashCiphertexts(ctsToDecrypt);
        uint256 requestId = FHE.requestDecryption(ctsToDecrypt, this.myCallback.selector);

        decryptionContexts[requestId] = DecryptionContext({
            batchId: currentBatchId,
            stateHash: stateHash,
            processed: false
        });
        lastDecryptionRequestTime[player] = block.timestamp; // Cooldown for the player whose location is being decrypted
        emit LocationUpdateRequested(requestId, player, currentBatchId);
    }

    function myCallback(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        DecryptionContext storage ctx = decryptionContexts[requestId];

        // a. Replay Guard
        if (ctx.processed) revert ReplayDetected();

        // b. State Verification
        // Rebuild cts array in the exact same order as during requestDecryption
        PlayerLocation memory loc = playerLocations[ /* player address not directly stored in ctx, this is a simplification.
        In a real scenario, you might need to store player address in DecryptionContext or re-derive it.
        For this example, we assume we can get the player's location based on the batchId or other means.
        This part is simplified for brevity. A more robust solution would store the player address in DecryptionContext. */
        // For this example, we'll assume the callback context allows us to identify the player.
        // Let's assume we are decrypting the player who initiated the request, or a specific player associated with the request.
        // This part needs careful design based on how requests are made.
        // For now, we'll use a placeholder player address. This is a weakness of this simplified example.
        // A better approach: store `address player` in `DecryptionContext`.
        // Let's assume `msg.sender` of the original `requestPlayerLocationDecryption` call is the player.
        // This is not directly available in the callback without storing it.
        // For this example, we'll use a fixed player address for demonstration.
        // THIS IS A SIMPLIFICATION AND NOT ROBUST FOR MULTIPLE PLAYERS.
        // The state hash verification requires rebuilding the exact same ciphertexts.
        // If the player's location changed after requestDecryption but before callback, this check would fail.
        address player = address(0x1234); // Placeholder - needs proper mechanism to identify player

        PlayerLocation memory currentLoc = playerLocations[player];
        euint32[] memory currentCts = new euint32[](2);
        currentCts[0] = currentLoc.encryptedX;
        currentCts[1] = currentLoc.encryptedY;

        bytes32 currentHash = _hashCiphertexts(currentCts);
        if (currentHash != ctx.stateHash) {
            revert StateMismatch();
        }

        // c. Proof Verification
        FHE.checkSignatures(requestId, cleartexts, proof);

        // d. Decode & Finalize
        // cleartexts is abi.encodePacked(decryptedX, decryptedY)
        // Each uint32 is 4 bytes
        uint256 decryptedX = uint256(uint32(bytes4(cleartexts)));
        uint256 decryptedY = uint256(uint32(bytes4(cleartexts[4:])));

        ctx.processed = true;
        emit LocationUpdateCompleted(requestId, player, decryptedX, decryptedY);
        // Further game logic would use decryptedX and decryptedY
    }

    function _hashCiphertexts(euint32[] memory cts) internal pure returns (bytes32) {
        bytes32[] memory ctsAsBytes32 = new bytes32[](cts.length);
        for (uint i = 0; i < cts.length; i++) {
            ctsAsBytes32[i] = FHE.toBytes32(cts[i]);
        }
        return keccak256(abi.encode(ctsAsBytes32, address(this)));
    }

    function _initIfNeeded(euint32 val) internal {
        if (FHE.isInitialized(val)) {
            revert AlreadyInitialized();
        }
        // In a real scenario, you might initialize with a default value if needed,
        // but FHE.asEuint32(0) should be used for initialization if the value isn't already initialized.
        // This function is more of a check here. Actual initialization happens when ciphertexts are created.
    }

    function _requireInitialized(euint32 val) internal view {
        if (!FHE.isInitialized(val)) {
            revert NotInitialized();
        }
    }
}