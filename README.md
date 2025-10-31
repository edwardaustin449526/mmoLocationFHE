
# Hidden Realms: An FHE-based MMORPG Experience 🌍🔒

Hidden Realms is an innovative MMORPG where players' locations on the map are encrypted by default using **Zama's Fully Homomorphic Encryption technology**. This unique design enables a seamless and secure gaming experience, allowing players to explore vast realms while keeping their exact positions private, ensuring a thrilling sense of adventure without compromising privacy.

## The Challenge: Ultimate Privacy in Gaming

In traditional online multiplayer games, players often expose their exact locations, making them vulnerable to unwanted interactions, such as ambushes or harassment. This raises significant concerns about user privacy and safety, leading to a less enjoyable gaming experience. Players seek a solution that allows them to engage in exploration and combat without the fear of being tracked or attacked based on their geographical positions. 

## Enter FHE Solutions: Leveling Up Privacy 

Hidden Realms addresses this critical issue by leveraging **Fully Homomorphic Encryption (FHE)** to protect player location data. With Zama’s open-source libraries, including **Concrete** and the **zama-fhe SDK**, we encrypt users' locations, so only vague area indicators are visible to others unless users decide to share their position. This approach not only enhances gameplay by adding an element of surprise and strategy but also realistically simulates the concept of privacy boundaries in the natural world.

## Key Features of Hidden Realms

- **Default Location Encryption**: Players' precise locations are encrypted by default, offering unparalleled awareness of their surroundings without the risk of exposure.
- **Exploration Boost**: The game's design encourages exploration with a constant sense of adventure, as players navigate through blurred maps and can choose to reveal their locations strategically.
- **Dynamic Team Play**: Players can opt-in to share their locations with allies to gather in specific areas, enhancing cooperative gameplay while maintaining overall privacy.
- **Real-world Privacy Simulation**: The game mimics societal privacy norms, providing a more immersive and realistic gaming experience.
- **Interactive Map with Obscured Details**: The game features a beautifully crafted map adorned with blur effects, ensuring that only the necessary information is available to players while keeping their precise locations safe.

## Technology Stack

Hidden Realms is built using a cutting-edge technology stack that facilitates secure and confidential gaming. Key components include:
- **Zama’s Fully Homomorphic Encryption SDK** 
- **Node.js** for server-side JavaScript
- **Hardhat** for Ethereum development environment
- **Solidity** for smart contract development
- **React** for building the front-end user interface

## Directory Structure

Below is the structure of the project directory, which organizes the key components and contracts efficiently:

```
/hidden-realms
|-- /contracts
|   |-- mmoLocationFHE.sol
|-- /src
|   |-- index.js
|   |-- App.js
|-- /tests
|   |-- mmoLocationFHE.test.js
|-- package.json
|-- hardhat.config.js
```

## Getting Started: Installation Guide

To set up the Hidden Realms project, ensure that you have installed Node.js and Hardhat or Foundry on your machine. Follow the steps below:

1. **Download the Project**: Ensure that you have the project files ready on your local machine.
   
2. **Navigate to the Project Directory**: Open your command line interface and navigate to the directory where Hidden Realms is stored.

3. **Install Dependencies**: Run the following command to install all necessary dependencies, including Zama's FHE libraries:
   ```bash
   npm install
   ```

## Build & Run Instructions

After installing the necessary dependencies, follow these commands to compile, test, and start the game:

1. **Compile the Smart Contracts**:
   ```bash
   npx hardhat compile
   ```

2. **Run Tests**: Ensure everything is functioning correctly by running:
   ```bash
   npx hardhat test
   ```

3. **Launch the Game**: Start the local development server with:
   ```bash
   npx hardhat run scripts/start.js
   ```

Enjoy exploring the Hidden Realms where your journey unfolds in secrecy and excitement! 

## Example: Encrypting Player Location

Here's a quick code snippet demonstrating how we handle the encryption of player locations using Zama's technology:

```javascript
const { encrypt, decrypt } = require('zama-fhe-sdk');

async function handlePlayerMovement(playerId, newPosition) {
    const encryptedPosition = await encrypt(newPosition);
    // Logic to save encrypted position to the player's data
    console.log(`Player ${playerId} moved to new encrypted location: ${encryptedPosition}`);
}

// Sample usage
handlePlayerMovement('player_001', { x: 100, y: 150 });
```

This snippet shows how the player's new location is encrypted before being stored, ensuring privacy at all times.

## Acknowledgements

**Powered by Zama**: We would like to extend our heartfelt gratitude to the Zama team for their pioneering work in the field of confidential computing. Their open-source tools, specifically designed for building applications with privacy at their core, have made it possible for us to create an MMORPG experience that respects user privacy while delivering engaging and interactive gameplay.

Join us in Hidden Realms and embark on your adventure today! ⚔️✨
```
