import { Event } from './Event';
import { Bet } from './Bet';
import { BetAppContract } from './BetAppContract';
import { BetTokenContract } from './BetTokenContract';
import { jest } from '@jest/globals';

import {
    isReady,
    shutdown,
    Field,
    Mina,
    PrivateKey,
    PublicKey,
    AccountUpdate,
    UInt64,
    MerkleMap,
    Circuit,
    UInt32,
    Signature,
    Poseidon
} from 'snarkyjs';

let feePayerKey: PrivateKey;

let betAppContract: BetAppContract;
let betAppPrivateKey: PrivateKey;
let betAppPublicKey: PublicKey;

let betTokenContract: BetTokenContract;
let betTokenPrivateKey: PrivateKey;
let betTokenPublicKey: PublicKey;
let tokenId: Field;

let proofsEnabled = false;

function setUpAccounts() {
    let Local = Mina.LocalBlockchain({
        proofsEnabled: proofsEnabled
    });
    Mina.setActiveInstance(Local);
    feePayerKey = Local.testAccounts[0].privateKey;

    betAppPrivateKey = PrivateKey.random();
    betAppPublicKey = betAppPrivateKey.toPublicKey();

    betTokenPrivateKey = PrivateKey.fromBase58('EKEV3xCNi92L46buQiT9q3pzo4tZiNNfDjeG2JRKzvZrr8Yofxad');
    betTokenPublicKey = betTokenPrivateKey.toPublicKey();

    console.log('public key', betTokenPublicKey.toBase58())
    betTokenContract = new BetTokenContract(betTokenPublicKey);
    tokenId = betTokenContract.token.id;

    betAppContract = new BetAppContract(betAppPublicKey);
}

async function localDeploy() {
    setUpAccounts()

    let txn = await Mina.transaction(feePayerKey, () => {
        AccountUpdate.fundNewAccount(feePayerKey);
        betTokenContract.deploy({ zkappKey: betTokenPrivateKey });
    })

    await txn.prove();
    await txn.send();

    let txn_1 = await Mina.transaction(feePayerKey, () => {
        AccountUpdate.createSigned(feePayerKey).balance.subInPlace(Mina.accountCreationFee().mul(2));
        betAppContract.deploy({ zkappKey: betAppPrivateKey });
        betTokenContract.deployBetApp(betAppPublicKey);
    });

    await txn_1.prove();
    // txn_1.sign([betAppPrivateKey, betTokenPrivateKey]);
    txn_1.sign([betAppPrivateKey, betTokenPrivateKey]);
    await txn_1.send();

    Circuit.log('Bet app balance', Mina.getBalance(betAppPublicKey, tokenId).value.toBigInt())
    console.log('Complete')
}

async function fundAccountWithBetToken() {
    const tree = new MerkleMap();
    const witness = tree.getWitness(Poseidon.hash(feePayerKey.toPublicKey().toFields()));

    const txn = await Mina.transaction(feePayerKey, () => {
        AccountUpdate.fundNewAccount(feePayerKey)
        betTokenContract.faucet(feePayerKey.toPublicKey(), witness, UInt64.from(0))
    });
    await txn.prove();
    await txn.send();
}

async function placeBet() {
    // Generate new bets
    await fetch('http://localhost:3005/generate')
    // Pull the bets off the oracle
    const response = await fetch('http://localhost:3005/bets');

    // Set up precondtion data
    const data = await response.json();
    const bet0 = data.ongoing_bets[0];
    const event = new Event({
        id: UInt64.from(bet0.id),
        betsStartDate: UInt64.from(bet0.bet_start_date),
        betsEndDate: UInt64.from(bet0.bet_end_date),
        betOptions: [UInt32.from(bet0.bet_options[0].id), UInt32.from(bet0.bet_options[1].id), UInt32.from(bet0.bet_options[2].id)]
    })

    const bet = new Bet({
        eventId: event.id,
        betOptionId: event.betOptions[0],
        bettorAddress: feePayerKey.toPublicKey(),
        betTokenAmount: UInt64.from(1000),
    });
    // Generate signature
    const signature = Signature.fromJSON(bet0.signature);

    // User haven't placed any bet yet
    const tree = new MerkleMap();
    const witness = tree.getWitness(bet.hash());

    const txn = await Mina.transaction(feePayerKey, () => {
        betAppContract.placeBet(event, bet, witness, signature);
    });

    await txn.prove();
    txn.sign([betAppPrivateKey, feePayerKey, betTokenPrivateKey]);
    await txn.send();
}

describe.skip('BetAppContract', () => {
    beforeAll(async () => {
        await isReady;
        // await BetTokenContract.compile();
        // await BetAppContract.compile();
        // await BetTokenContract.compile();
    })

    afterAll(() => setTimeout(shutdown, 0));

    test('correct token id can be derived with an existing token owner 1', () => {
        expect(tokenId).toEqual(betAppContract.token.id);
    });
    test('correct token id can be derived with an existing token owner 2', () => {
        expect(tokenId).toEqual(betAppContract.token.parentTokenId);
    });

    test("test", () => {
        const oneTree = new MerkleMap();
        const secondTree = new MerkleMap();

        oneTree.set(Field(55), Field(60));
        oneTree.set(Field(0), Field(1));
        oneTree.set(Field(1), Field(0));


        secondTree.set(Field(1), Field(0));
        secondTree.set(Field(0), Field(1));
        secondTree.set(Field(55), Field(60));

        expect(oneTree.getRoot()).toEqual(secondTree.getRoot());
    })

    describe('Place bet feature', () => {
        jest.setTimeout(400000);
        beforeEach(async () => {
            await localDeploy();
        });
        test('Place bet on the match for the first time. Result successful', async () => {
            console.log('Start 1 test')
            // Facuet 
            await fundAccountWithBetToken();

            // Execution
            await placeBet();

            Circuit.log('events', await betAppContract.fetchEvents())

            const EXPECTED_USER_BALANCE = Field(99000);
            const EXPECTED_APP_BALANCE = Field(101000);

            const userBalance = Mina.getAccount(feePayerKey.toPublicKey(), tokenId).balance.value;
            const appBalance = Mina.getAccount(betAppPrivateKey.toPublicKey(), tokenId).balance.value;

            expect(userBalance).toEqual(EXPECTED_USER_BALANCE);
            expect(appBalance).toEqual(EXPECTED_APP_BALANCE);

        })
        test('Cancel bet. Result successful', async () => {
            console.log('Start 2 test')
            // Facuet 
            await fundAccountWithBetToken();

            // Generate new bets
            await fetch('http://localhost:3005/generate')
            // Pull the bets off the oracle
            const response = await fetch('http://localhost:3005/bets');

            // Set up precondtion data
            const data = await response.json();
            const bet0 = data.ongoing_bets[0];
            const event = new Event({
                id: UInt64.from(bet0.id),
                betsStartDate: UInt64.from(bet0.bet_start_date),
                betsEndDate: UInt64.from(bet0.bet_end_date),
                betOptions: [UInt32.from(bet0.bet_options[0].id), UInt32.from(bet0.bet_options[1].id), UInt32.from(bet0.bet_options[2].id)]
            })

            const bet = new Bet({
                eventId: event.id,
                betOptionId: event.betOptions[0],
                bettorAddress: feePayerKey.toPublicKey(),
                betTokenAmount: UInt64.from(1000),
            });
            // Generate signature
            const signature = Signature.fromJSON(bet0.signature);

            // User haven't placed any bet yet
            const tree = new MerkleMap();
            const witness = tree.getWitness(bet.hash());

            const userBalance1 = Mina.getAccount(feePayerKey.toPublicKey(), tokenId).balance.toBigInt();

            Circuit.log('userbalance=', userBalance1);

            const txn = await Mina.transaction({ feePayerKey }, () => {
                // AccountUpdate.createSigned(feePayerKey).balance.subInPlace(Mina.accountCreationFee().mul(2));
                // AccountUpdate.fundNewAccount(feePayerKey);
                betAppContract.placeBet(event, bet, witness, signature);
            });

            await txn.prove();
            txn.sign([feePayerKey]);
            await txn.send();

            const PLACE_BET_EXPECTED_USER_BALANCE = Field(99000);
            const PLACE_BET_EXPECTED_APP_BALANCE = Field(101_000);

            let userBalance = Mina.getAccount(feePayerKey.toPublicKey(), tokenId).balance.value;
            let appBalance = Mina.getAccount(betAppPrivateKey.toPublicKey(), tokenId).balance.value;

            expect(userBalance).toEqual(PLACE_BET_EXPECTED_USER_BALANCE);
            expect(appBalance).toEqual(PLACE_BET_EXPECTED_APP_BALANCE);

            const txn_bet_cancel = await Mina.transaction(feePayerKey, () => {
                betAppContract.cancelBet(bet, witness);
            });

            await txn_bet_cancel.prove();
            txn_bet_cancel.sign([betAppPrivateKey]);
            await txn_bet_cancel.send();

            const CANCEL_BET_EXPECTED_USER_BALANCE = Field(100_000);
            const CANCEL_BET_EXPECTED_APP_BALANCE = Field(100_000);

            userBalance = Mina.getAccount(feePayerKey.toPublicKey(), tokenId).balance.value;
            appBalance = Mina.getAccount(betAppPrivateKey.toPublicKey(), tokenId).balance.value;

            expect(userBalance).toEqual(CANCEL_BET_EXPECTED_USER_BALANCE);
            expect(appBalance).toEqual(CANCEL_BET_EXPECTED_APP_BALANCE);
        })

        test('Claim reward. Result successful', async () => {
            console.log('Start 3 test')
            // Facuet 
            await fundAccountWithBetToken();

            // Generate new bets
            await fetch('http://localhost:3005/generate')
            // Pull the bets off the oracle
            const response = await fetch('http://localhost:3005/bets');

            // Set up precondtion data
            const data = await response.json();
            const bet0 = data.ongoing_bets[0];
            const event = new Event({
                id: UInt64.from(bet0.id),
                betsStartDate: UInt64.from(bet0.bet_start_date),
                betsEndDate: UInt64.from(bet0.bet_end_date),
                betOptions: [UInt32.from(bet0.bet_options[0].id), UInt32.from(bet0.bet_options[1].id), UInt32.from(bet0.bet_options[2].id)]
            })

            const bet = new Bet({
                eventId: event.id,
                betOptionId: event.betOptions[0],
                bettorAddress: feePayerKey.toPublicKey(),
                betTokenAmount: UInt64.from(1000),
            });
            // Generate signature
            const signature = Signature.fromJSON(bet0.signature);

            // User haven't placed any bet yet
            const tree = new MerkleMap();
            const witness = tree.getWitness(bet.hash());

            const txn = await Mina.transaction(feePayerKey, () => {
                betAppContract.placeBet(event, bet, witness, signature);
            });

            await txn.prove();
            txn.sign([feePayerKey]);
            await txn.send();

            // Finish the bet with id 5 (winner is always 0)
            await fetch('http://localhost:3005/reveal?id=5')
            // Pull the bets off the oracle
            const newResponse = await fetch('http://localhost:3005/bets');

            // Set up precondtion data
            const newData = await newResponse.json();
            const finishedBet = newData.finished_bets[0];

            // Generate signature
            const finished_bet_signature = Signature.fromJSON(finishedBet.signature);

            const claim_reward_txn = await Mina.transaction(feePayerKey, () => {
                betAppContract.claimReward(event, UInt32.from(0), bet, witness, finished_bet_signature);
            });

            await claim_reward_txn.prove();
            claim_reward_txn.sign([betAppPrivateKey]);
            await claim_reward_txn.send();

            const EXPECTED_USER_BALANCE = Field(101_000);
            const EXPECTED_APP_BALANCE = Field(99_000);

            const userBalance = Mina.getAccount(feePayerKey.toPublicKey(), tokenId).balance.value;
            const appBalance = Mina.getAccount(betAppPrivateKey.toPublicKey(), tokenId).balance.value;

            expect(userBalance).toEqual(EXPECTED_USER_BALANCE);
            expect(appBalance).toEqual(EXPECTED_APP_BALANCE);
        })
    });
});
