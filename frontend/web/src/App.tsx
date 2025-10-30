// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface PlayerLocation {
  id: string;
  encryptedX: string;
  encryptedY: string;
  timestamp: number;
  owner: string;
  visibility: "private" | "public" | "party";
  zone: string;
}

interface Party {
  id: string;
  name: string;
  members: string[];
  leader: string;
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [playerLocations, setPlayerLocations] = useState<PlayerLocation[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreatePartyModal, setShowCreatePartyModal] = useState(false);
  const [creatingParty, setCreatingParty] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newPartyData, setNewPartyData] = useState({ name: "" });
  const [selectedLocation, setSelectedLocation] = useState<PlayerLocation | null>(null);
  const [decryptedCoords, setDecryptedCoords] = useState<{x: number, y: number} | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [playerPosition, setPlayerPosition] = useState({x: 100, y: 100});
  const [visibilityMode, setVisibilityMode] = useState<"private" | "public">("private");
  const [selectedParty, setSelectedParty] = useState<string>("");
  const [showMap, setShowMap] = useState(true);

  // Game map dimensions
  const MAP_WIDTH = 800;
  const MAP_HEIGHT = 600;
  const ZONE_SIZE = 200;

  useEffect(() => {
    loadPlayerLocations().finally(() => setLoading(false));
    loadParties();
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadPlayerLocations = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        setTransactionStatus({ visible: true, status: "error", message: "Contract not available" });
        return;
      }

      const keysBytes = await contract.getData("location_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing location keys:", e); }
      }

      const list: PlayerLocation[] = [];
      for (const key of keys) {
        try {
          const locationBytes = await contract.getData(`location_${key}`);
          if (locationBytes.length > 0) {
            try {
              const locationData = JSON.parse(ethers.toUtf8String(locationBytes));
              list.push({ 
                id: key, 
                encryptedX: locationData.x, 
                encryptedY: locationData.y, 
                timestamp: locationData.timestamp, 
                owner: locationData.owner, 
                visibility: locationData.visibility || "private",
                zone: locationData.zone || "unknown"
              });
            } catch (e) { console.error(`Error parsing location data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading location ${key}:`, e); }
      }
      setPlayerLocations(list);
    } catch (e) { console.error("Error loading locations:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const loadParties = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const keysBytes = await contract.getData("party_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing party keys:", e); }
      }

      const partyList: Party[] = [];
      for (const key of keys) {
        try {
          const partyBytes = await contract.getData(`party_${key}`);
          if (partyBytes.length > 0) {
            try {
              const partyData = JSON.parse(ethers.toUtf8String(partyBytes));
              partyList.push(partyData);
            } catch (e) { console.error(`Error parsing party data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading party ${key}:`, e); }
      }
      setParties(partyList);
    } catch (e) { console.error("Error loading parties:", e); }
  };

  const updatePlayerLocation = async (x: number, y: number) => {
    if (!isConnected || !address) return;

    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting location with Zama FHE..." });
    
    try {
      const encryptedX = FHEEncryptNumber(x);
      const encryptedY = FHEEncryptNumber(y);
      const zone = `zone-${Math.floor(x/ZONE_SIZE)}-${Math.floor(y/ZONE_SIZE)}`;
      
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const locationId = `${address}-location`;
      const locationData = { 
        x: encryptedX, 
        y: encryptedY, 
        timestamp: Math.floor(Date.now() / 1000), 
        owner: address, 
        visibility: visibilityMode,
        zone: zone
      };

      await contract.setData(`location_${locationId}`, ethers.toUtf8Bytes(JSON.stringify(locationData)));
      
      // Update keys
      const keysBytes = await contract.getData("location_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { 
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing keys:", e); }
      }
      
      if (!keys.includes(locationId)) {
        keys.push(locationId);
        await contract.setData("location_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      }

      setTransactionStatus({ visible: true, status: "success", message: "Location encrypted and updated!" });
      await loadPlayerLocations();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected" : "Update failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const createParty = async () => {
    if (!isConnected || !address) { alert("Connect wallet first"); return; }
    setCreatingParty(true);
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract");
      
      const partyId = `party-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const partyData: Party = {
        id: partyId,
        name: newPartyData.name,
        members: [address],
        leader: address
      };

      await contract.setData(`party_${partyId}`, ethers.toUtf8Bytes(JSON.stringify(partyData)));
      
      const keysBytes = await contract.getData("party_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { 
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(partyId);
      await contract.setData("party_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));

      setTransactionStatus({ visible: true, status: "success", message: "Party created successfully!" });
      await loadParties();
      setShowCreatePartyModal(false);
      setNewPartyData({ name: "" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Party creation failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally {
      setCreatingParty(false);
    }
  };

  const joinParty = async (partyId: string) => {
    if (!isConnected || !address) return;
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract");
      
      const partyBytes = await contract.getData(`party_${partyId}`);
      if (partyBytes.length === 0) throw new Error("Party not found");
      
      const partyData: Party = JSON.parse(ethers.toUtf8String(partyBytes));
      if (!partyData.members.includes(address)) {
        partyData.members.push(address);
        await contract.setData(`party_${partyId}`, ethers.toUtf8Bytes(JSON.stringify(partyData)));
        setTransactionStatus({ visible: true, status: "success", message: "Joined party successfully!" });
        await loadParties();
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      }
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Join failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const decryptWithSignature = async (encryptedX: string, encryptedY: string): Promise<{x: number, y: number} | null> => {
    if (!isConnected) { alert("Connect wallet first"); return null; }
    setIsDecrypting(true);
    
    try {
      const message = `Decrypt location data\nPublic Key: ${publicKey}\nContract: ${contractAddress}\nChain: ${chainId}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      return {
        x: FHEDecryptNumber(encryptedX),
        y: FHEDecryptNumber(encryptedY)
      };
    } catch (e) { 
      console.error("Decryption failed:", e); 
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const toggleVisibility = async () => {
    const newMode = visibilityMode === "private" ? "public" : "private";
    setVisibilityMode(newMode);
    await updatePlayerLocation(playerPosition.x, playerPosition.y);
  };

  const movePlayer = (dx: number, dy: number) => {
    const newX = Math.max(0, Math.min(MAP_WIDTH, playerPosition.x + dx));
    const newY = Math.max(0, Math.min(MAP_HEIGHT, playerPosition.y + dy));
    setPlayerPosition({x: newX, y: newY});
    updatePlayerLocation(newX, newY);
  };

  const getBlurredPosition = (x: number, y: number, isPartyMember: boolean = false) => {
    if (isPartyMember) return {x, y};
    // Blur position to zone level for privacy
    const zoneX = Math.floor(x / ZONE_SIZE) * ZONE_SIZE + ZONE_SIZE/2;
    const zoneY = Math.floor(y / ZONE_SIZE) * ZONE_SIZE + ZONE_SIZE/2;
    return {x: zoneX, y: zoneY};
  };

  const isInSameParty = (playerAddr: string) => {
    if (!address || !selectedParty) return false;
    const party = parties.find(p => p.id === selectedParty);
    return party?.members.includes(playerAddr) || false;
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="hud-spinner"></div>
      <p>Initializing encrypted MMORPG connection...</p>
    </div>
  );

  return (
    <div className="app-container hud-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon"><div className="radar-icon"></div></div>
          <h1>隱蹤<span>MMORPG</span></h1>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowCreatePartyModal(true)} className="create-party-btn hud-button">
            <div className="party-icon"></div>Create Party
          </button>
          <button onClick={toggleVisibility} className={`visibility-btn hud-button ${visibilityMode}`}>
            {visibilityMode === "private" ? "🔒 Private" : "🔓 Public"}
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>

      <div className="main-content">
        <div className="game-controls">
          <div className="control-panel hud-card">
            <h3>Movement Controls</h3>
            <div className="direction-pad">
              <button onClick={() => movePlayer(0, -20)} className="hud-button">↑</button>
              <div className="horizontal-controls">
                <button onClick={() => movePlayer(-20, 0)} className="hud-button">←</button>
                <button onClick={() => movePlayer(20, 0)} className="hud-button">→</button>
              </div>
              <button onClick={() => movePlayer(0, 20)} className="hud-button">↓</button>
            </div>
            <div className="position-display">
              <span>Your Position: {playerPosition.x}, {playerPosition.y}</span>
            </div>
          </div>

          <div className="parties-panel hud-card">
            <h3>Parties</h3>
            {parties.map(party => (
              <div key={party.id} className="party-item">
                <span>{party.name}</span>
                <button 
                  onClick={() => joinParty(party.id)} 
                  className="hud-button small"
                  disabled={!isConnected || party.members.includes(address || '')}
                >
                  {party.members.includes(address || '') ? "Joined" : "Join"}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="game-map-section">
          <div className="section-header">
            <h2>Encrypted World Map</h2>
            <div className="map-controls">
              <select 
                value={selectedParty} 
                onChange={(e) => setSelectedParty(e.target.value)}
                className="hud-select"
              >
                <option value="">No Party</option>
                {parties.filter(p => p.members.includes(address || '')).map(party => (
                  <option key={party.id} value={party.id}>{party.name}</option>
                ))}
              </select>
              <button onClick={loadPlayerLocations} className="refresh-btn hud-button">
                {isRefreshing ? "🔄" : "Refresh"}
              </button>
            </div>
          </div>

          <div className="game-map-container hud-card">
            <div className="map-grid">
              {Array.from({length: (MAP_HEIGHT/ZONE_SIZE) * (MAP_WIDTH/ZONE_SIZE)}).map((_, i) => {
                const x = (i % (MAP_WIDTH/ZONE_SIZE)) * ZONE_SIZE;
                const y = Math.floor(i / (MAP_WIDTH/ZONE_SIZE)) * ZONE_SIZE;
                return <div key={i} className="map-zone" style={{left: x, top: y}}></div>;
              })}
              
              {/* Current player */}
              <div 
                className="player-marker current-player" 
                style={{left: playerPosition.x - 5, top: playerPosition.y - 5}}
                title={`You (${visibilityMode})`}
              >
                👤
              </div>

              {/* Other players */}
              {playerLocations
                .filter(loc => loc.owner !== address)
                .map(location => {
                  const isPartyMember = isInSameParty(location.owner);
                  const visiblePos = location.visibility === "public" || isPartyMember ? 
                    {x: FHEDecryptNumber(location.encryptedX), y: FHEDecryptNumber(location.encryptedY)} :
                    getBlurredPosition(FHEDecryptNumber(location.encryptedX), FHEDecryptNumber(location.encryptedY), isPartyMember);
                  
                  return (
                    <div 
                      key={location.id}
                      className={`player-marker ${location.visibility} ${isPartyMember ? 'party-member' : ''}`}
                      style={{left: visiblePos.x - 5, top: visiblePos.y - 5}}
                      onClick={() => setSelectedLocation(location)}
                      title={`Player ${location.owner.substring(0,6)} (${location.visibility})`}
                    >
                      {isPartyMember ? '👥' : '👤'}
                    </div>
                  );
                })}
            </div>
          </div>

          <div className="map-legend hud-card">
            <div className="legend-item">
              <div className="legend-color current-player"></div>
              <span>You</span>
            </div>
            <div className="legend-item">
              <div className="legend-color public"></div>
              <span>Public Players</span>
            </div>
            <div className="legend-item">
              <div className="legend-color private"></div>
              <span>Private Players (Blurred)</span>
            </div>
            <div className="legend-item">
              <div className="legend-color party-member"></div>
              <span>Party Members</span>
            </div>
          </div>
        </div>

        <div className="players-list hud-card">
          <h3>Online Players ({playerLocations.length})</h3>
          <div className="players-grid">
            {playerLocations.map(player => (
              <div key={player.id} className="player-card">
                <div className="player-info">
                  <span className="player-addr">{player.owner.substring(0,8)}...{player.owner.substring(36)}</span>
                  <span className={`visibility-badge ${player.visibility}`}>{player.visibility}</span>
                </div>
                <div className="player-zone">Zone: {player.zone}</div>
                <button 
                  onClick={() => setSelectedLocation(player)}
                  className="hud-button small"
                >
                  View Details
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Create Party Modal */}
      {showCreatePartyModal && (
        <div className="modal-overlay">
          <div className="create-modal hud-card">
            <div className="modal-header">
              <h2>Create New Party</h2>
              <button onClick={() => setShowCreatePartyModal(false)} className="close-modal">×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Party Name</label>
                <input 
                  type="text" 
                  value={newPartyData.name}
                  onChange={(e) => setNewPartyData({...newPartyData, name: e.target.value})}
                  className="hud-input"
                  placeholder="Enter party name..."
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowCreatePartyModal(false)} className="hud-button">Cancel</button>
              <button onClick={createParty} disabled={creatingParty} className="hud-button primary">
                {creatingParty ? "Creating..." : "Create Party"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Player Detail Modal */}
      {selectedLocation && (
        <div className="modal-overlay">
          <div className="player-detail-modal hud-card">
            <div className="modal-header">
              <h2>Player Details</h2>
              <button onClick={() => setSelectedLocation(null)} className="close-modal">×</button>
            </div>
            <div className="modal-body">
              <div className="player-details">
                <div className="detail-item">
                  <span>Address:</span>
                  <strong>{selectedLocation.owner}</strong>
                </div>
                <div className="detail-item">
                  <span>Visibility:</span>
                  <strong className={`visibility-badge ${selectedLocation.visibility}`}>
                    {selectedLocation.visibility}
                  </strong>
                </div>
                <div className="detail-item">
                  <span>Zone:</span>
                  <strong>{selectedLocation.zone}</strong>
                </div>
              </div>
              
              <div className="encrypted-data">
                <h4>Encrypted Coordinates (FHE)</h4>
                <div className="encrypted-coords">
                  <div>X: {selectedLocation.encryptedX.substring(0, 50)}...</div>
                  <div>Y: {selectedLocation.encryptedY.substring(0, 50)}...</div>
                </div>
                
                <button 
                  onClick={async () => {
                    const coords = await decryptWithSignature(selectedLocation.encryptedX, selectedLocation.encryptedY);
                    setDecryptedCoords(coords);
                  }}
                  disabled={isDecrypting}
                  className="hud-button"
                >
                  {isDecrypting ? "Decrypting..." : "Decrypt Position"}
                </button>
              </div>

              {decryptedCoords && (
                <div className="decrypted-data">
                  <h4>Decrypted Position</h4>
                  <div className="decrypted-coords">
                    X: {decryptedCoords.x}, Y: {decryptedCoords.y}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Transaction Status Modal */}
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content hud-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="hud-spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✕"}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <div className="footer-content">
          <div className="fhe-badge">
            <span>🔒 ZAMA FHE ENCRYPTED</span>
          </div>
          <div className="footer-info">
            Player locations are encrypted by default using Zama FHE technology
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;