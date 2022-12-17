# Bet ZK application: Contracts

Bet application is designed to provide secure and decentralized way to bet on current events. The user has a list of events (i.e., football matches) where everyone can choose a winner from the available options (i.e. team 1 win / team 2 win / draw). They can place a bet with an app-related coin called BET. After the end of the event oracle server will be updated and the winner will be revealed. The winners receive their rewards, the losers lose everything they wagered.

It is supposed to make up of 3 parts:
  - UI + Smart Contract
  - Offchain server
  - Oracle server 

## How to run project for Berkeley testnet

### Running oracle server

Go to oracle repository and follow the steps described there

### Running UI

Go to UI repository and follow the steps described there

### How to run project locally

#### Running tests
```sh
npm run test
```

#### Running simple interaction with off-chain server

```sh
npm run build && node build/src/main-local.js
```

## All repository locations:
  - (UI) https://github.com/magestrio/bet-app-zk-ui
  - (Smart Contracts) https://github.com/magestrio/bet-app-zk-contracts (you are here)
  - (Oracle) https://github.com/magestrio/bet-oracle
  - (Off-chain) https://github.com/magestrio/bet-offchain

## Future milestone
  - Improving UI
  - Swapping MINA -> BET, BET -> MINA

## License

[Apache-2.0](LICENSE)
