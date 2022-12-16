import {
    Mina,
    isReady,
    PrivateKey,
    AccountUpdate,
    Signature,
    shutdown,
    MerkleMap,
    Poseidon,
    UInt64,
    UInt32
} from 'snarkyjs';
import { BetTokenContract } from './BetTokenContract.js';
import { BetAppContract } from './BetAppContract.js';
import { loopUntilAccountExists, makeAndSendTransaction } from './utils.js';


import XMLHttpRequestTs from 'xmlhttprequest-ts';
import { Event } from './Event.js';
import { Bet } from './Bet.js';

const useLocal = false;

(async function main() {
    await isReady;

    // ----------------------------------------

    const transactionFee = 100_000_0000;

    let feePayerKey: PrivateKey;
    let betTokenPrivateKey: PrivateKey;
    let betAppPrvateKey: PrivateKey;

    if (useLocal) {
        const Local = Mina.LocalBlockchain();
        Mina.setActiveInstance(Local);

        feePayerKey = Local.testAccounts[0].privateKey;
        betTokenPrivateKey = PrivateKey.random();
        betAppPrvateKey = PrivateKey.random();
    } else {
        const Berkeley = Mina.Network(
            'https://proxy.berkeley.minaexplorer.com/graphql'
        );
        Mina.setActiveInstance(Berkeley);

        feePayerKey = PrivateKey.fromBase58('EKEUoD8cn1bUenkWg3viWib8UohfaAkuwY5MeAo6B6ZECWmFbLDX');
        betTokenPrivateKey = PrivateKey.fromBase58('EKEpu6aFo9RF4juALwXjadcrWiSFHUovJiEkk8TzrfV7btrHmJke');
        betAppPrvateKey = PrivateKey.fromBase58('EKEjteHUynLTh6De95t9xH67AHjBfHTHYnZGaKEwsfsHFPBPwJF1');
    }

    console.log('compiling')
    await BetTokenContract.compile();
    // await BetAppContract.compile();

    const betTokenContract = new BetTokenContract(betTokenPrivateKey.toPublicKey());
    


    await loopUntilAccountExists({
        account: betTokenPrivateKey.toPublicKey(),
        eachTimeNotExist: () => console.log('waiting for zkApp account to be deployed...'),
        isZkAppAccount: true
    });

    // await transfer_txn.prove();
    // transfer_txn.sign([feePayerKey])
    // await transfer_txn.send();

    await loopUntilAccountExists({
        account: betAppPrvateKey.toPublicKey(),
        eachTimeNotExist: () => console.log('waiting for zkApp account to be deployed...'),
        isZkAppAccount: true
    });

    const tree1 = new MerkleMap();
    const witness1 = tree1.getWitness(Poseidon.hash(feePayerKey.toPublicKey().toFields()));
    const lastTimeFauceted1 = UInt64.from(0);

    await makeAndSendTransaction({
        feePayerPrivateKey: feePayerKey,
        zkAppPublicKey: betTokenPrivateKey.toPublicKey(),
        mutateZkApp: () => {
            AccountUpdate.fundNewAccount(feePayerKey);
            betTokenContract.faucet(
                feePayerKey.toPublicKey(),
                witness1,
                lastTimeFauceted1
            );
        },
        transactionFee: transactionFee,
        getState: () => betTokenContract.accumulatedFaucetedUsers.get(),
        statesEqual: (root1, root2) => root1.equals(root2).toBoolean(),
        tokenId: 'betAppContract.token.id.toString()'
    });

    // const tree = new MerkleMap();
    // const witness = tree.getWitness(Poseidon.hash(feePayerKey.toPublicKey().toFields()));
    // const lastTimeFauceted = UInt64.from(123);

    console.log('sending transaction')
    const betAppContract = new BetAppContract(betAppPrvateKey.toPublicKey());
    // Generate new bets
    await fetch('http://localhost:3005/generate')
    // Pull the bets off the oracle
    const response = await fetch('http://localhost:3005/bets');

    // Set up precondtion data
    const data = await response.json();
    const bet0 = data.ongoing_bets[2];
    const event = new Event({
        id: UInt64.from(bet0.id),
        betsStartDate: UInt64.from(bet0.bet_start_date),
        betsEndDate: UInt64.from(bet0.bet_end_date),
        betOptions: [UInt32.from(bet0.bet_options[0].id), UInt32.from(bet0.bet_options[1].id), UInt32.from(bet0.bet_options[2].id)]
    })

    const bet = new Bet({
        eventId: event.id,
        betOptionId: event.betOptions[1],
        bettorAddress: feePayerKey.toPublicKey(),
        betTokenAmount: UInt64.from(1),
    });
    // Generate signature
    const signature = Signature.fromJSON(bet0.signature);

    // User haven't placed any bet yet
    const tree = new MerkleMap();
    let witness = tree.getWitness(bet.hash());

    // console.log('reset')
    // await makeAndSendTransaction({
    //     feePayerPrivateKey: feePayerKey,
    //     zkAppPublicKey: betTokenPrivateKey.toPublicKey(),
    //     mutateZkApp: () => {
    //         // AccountUpdate.fundNewAccount(feePayerKey);
    //         betAppContract.reset()
    //     },
    //     transactionFee: transactionFee,
    //     getState: () => betAppContract.betsTreeRoot.get(),
    //     statesEqual: (root1, root2) => root1.equals(root2).toBoolean(),
    //     tokenId: betAppContract.token.id.toString()
    // });

    // console.log('placeBet')
    await makeAndSendTransaction({
        feePayerPrivateKey: feePayerKey,
        zkAppPublicKey: betTokenPrivateKey.toPublicKey(),
        mutateZkApp: () => {
            betAppContract.placeBet(event, bet, witness, signature)
        },
        transactionFee: transactionFee,
        getState: () => betAppContract.betsTreeRoot.get(),
        statesEqual: (root1, root2) => root1.equals(root2).toBoolean(),
        tokenId: betAppContract.token.id.toString()
    });

    // tree.set(bet.hash(), bet.betTokenAmount.toFields()[0])

    witness = tree.getWitness(bet.hash());

    console.log('cancelBet')
    await makeAndSendTransaction({
        feePayerPrivateKey: feePayerKey,
        zkAppPublicKey: betTokenPrivateKey.toPublicKey(),
        mutateZkApp: () => {
            // AccountUpdate.fundNewAccount(feePayerKey);
            betAppContract.cancelBet(bet, witness)
        },
        transactionFee: transactionFee,
        getState: () => betAppContract.betsTreeRoot.get(),
        statesEqual: (root1, root2) => root1.equals(root2).toBoolean(),
        tokenId: betAppContract.token.id.toString()
    });


    // await makeAndSendTransaction({
    //     feePayerPrivateKey: feePayerKey,
    //     zkAppPublicKey: zkappPrivateKey.toPublicKey(),
    //     mutateZkApp: () => {
    //         betTokenContract.faucet(feePayerKey.toPublicKey(), witness, lastTimeFauceted)
    //     },
    //     transactionFee: transactionFee,
    //     getState: () => betTokenContract.faucetUsersTreeRoot.get(),
    //     statesEqual: (root1, root2) => root1.equals(root2).toBoolean(),
    //     tokenId: betTokenContract.token.id.toString()
    // });



    await shutdown();
})()