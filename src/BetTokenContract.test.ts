import { BetTokenContract } from './BetTokenContract';
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
    Poseidon,
    Circuit,
    ProvablePure
} from 'snarkyjs';
import { Entry } from './Entry';
const TOKEN_SYMBOL = 'BET';

let secondUserPrivateKey: PrivateKey;
let secondUserPublicKey: PublicKey;


let proofsEnabled = false;
function createLocalBlockchain() {
    const Local = Mina.LocalBlockchain({ proofsEnabled });
    Mina.setActiveInstance(Local);
    secondUserPrivateKey = Local.testAccounts[1].privateKey;
    return Local.testAccounts[0].privateKey;
}

async function localDeploy(
    zkAppInstance: BetTokenContract,
    zkAppPrivatekey: PrivateKey,
    deployerAccount: PrivateKey
) {
    const txn = await Mina.transaction(deployerAccount, () => {
        AccountUpdate.fundNewAccount(deployerAccount);
        zkAppInstance.deploy({ zkappKey: zkAppPrivatekey });
    });
    await txn.prove();
    txn.sign([zkAppPrivatekey]);
    await txn.send();
}

describe('BetTokenContract', () => {
    let feePayerAccount: PrivateKey,
        zkAppAddress: PublicKey,
        zkAppPrivateKey: PrivateKey;

    beforeAll(async () => {
        await isReady;
        if (proofsEnabled) BetTokenContract.compile();
    });

    beforeEach(async () => {
        feePayerAccount = createLocalBlockchain();
        secondUserPublicKey = secondUserPrivateKey.toPublicKey();
        zkAppPrivateKey = PrivateKey.random();
        zkAppAddress = zkAppPrivateKey.toPublicKey();
    });

    afterAll(async () => {
        setTimeout(shutdown, 0);
    });

    test.skip('generates and deploys the `BetTokenContract` smart contract', async () => {
        const zkAppInstance = new BetTokenContract(zkAppAddress);
        await localDeploy(zkAppInstance, zkAppPrivateKey, feePayerAccount);
        const zkAppAccount = Mina.getAccount(zkAppAddress);
        expect(zkAppAccount.tokenSymbol).toEqual(TOKEN_SYMBOL);
    });

    describe.skip('Check balance', () => {
        test('Check balance after fauceting', async () => {
            const zkAppInstance = new BetTokenContract(zkAppAddress);

            await localDeploy(zkAppInstance, zkAppPrivateKey, feePayerAccount);

            const tree = new MerkleMap();
            const witness = tree.getWitness(Poseidon.hash(feePayerAccount.toPublicKey().toFields()));

            const txn = await Mina.transaction(feePayerAccount, () => {
                AccountUpdate.fundNewAccount(feePayerAccount)
                zkAppInstance.faucet(feePayerAccount.toPublicKey(), witness, UInt64.from(0))
            });

            await txn.prove();
            txn.sign([feePayerAccount])
            await txn.send();

            const balance_txn = await Mina.transaction(feePayerAccount, ()=> {
                const balance = zkAppInstance.getBalanceOf(feePayerAccount.toPublicKey())
                Circuit.log('check balance', balance);
            });

            await balance_txn.prove();
            await balance_txn.send();
        })
    });

    describe('Bet token minting features', () => {
        test('User has never fauceted before. Transaction successful', async () => {
            const zkAppInstance = new BetTokenContract(zkAppAddress);
            console.log('1')
            await localDeploy(zkAppInstance, zkAppPrivateKey, feePayerAccount);

            const tree = new MerkleMap();

            //   const witness = tree.getWitness(Poseidon.hash(feePayerAccount.toPublicKey().toFields()));
            console.log('2')
            const witness = tree.getWitness(Poseidon.hash(feePayerAccount.toPublicKey().toFields()));

            console.log('3')
            const txn = await Mina.transaction(feePayerAccount, () => {
                AccountUpdate.fundNewAccount(feePayerAccount)
                zkAppInstance.faucet(feePayerAccount.toPublicKey(), witness, UInt64.from(0))
            });

            await txn.prove();
            txn.sign([feePayerAccount])
            await txn.send();

            // const witness1 = tree.getWitness(Poseidon.hash(secondUserPublicKey.toFields()));

            // const txn1 = await Mina.transaction(secondUserPrivateKey, () => {
            //     AccountUpdate.fundNewAccount(secondUserPrivateKey)
            //     zkAppInstance.faucet(secondUserPublicKey, witness1, UInt64.from(0))
            // });

            // await txn1.prove();
            // txn.sign([secondUserPrivateKey])
            // await txn1.send();

            const events = await zkAppInstance.fetchEvents();

            // let element = ;
            // Circuit.log('events key', events[0].event.toFields());
            let event: ProvablePure<any> = events[0].event;
            
            const result: Entry = JSON.parse(JSON.stringify(event))
            // const entry = Entry.empty();
            Circuit.log('events key', result.key);
            
            const accountBalance = Mina.getBalance(feePayerAccount.toPublicKey(), zkAppInstance.token.id).value;
            expect(accountBalance).toEqual(Field(100_000));
        });

        test.skip('User has fauceted 23 hours ago. Transaction rejected', async () => {
            const zkAppInstance = new BetTokenContract(zkAppAddress);
            await localDeploy(zkAppInstance, zkAppPrivateKey, feePayerAccount);

            const tree = new MerkleMap();
            const hours23Before = UInt64.from(Date.now()).sub(23 * 60 * 60 * 1000).toFields()[0];
            tree.set(feePayerAccount.toPublicKey().toFields()[0], hours23Before);

            const witness = tree.getWitness(feePayerAccount.toPublicKey().toFields()[0]);

            expect(async () => await Mina.transaction(feePayerAccount, () => {
                AccountUpdate.fundNewAccount(feePayerAccount)
                zkAppInstance.faucet(feePayerAccount.toPublicKey(), witness, UInt64.from(0))
            })).rejects;
        })

        test.skip('User has fauceted 25 hours ago. Transaction successful', async () => {
            const zkAppInstance = new BetTokenContract(zkAppAddress);
            await localDeploy(zkAppInstance, zkAppPrivateKey, feePayerAccount);

            const tree = new MerkleMap();
            const hours23Before = UInt64.from(Date.now()).sub(25 * 60 * 60 * 1000).toFields()[0];
            tree.set(feePayerAccount.toPublicKey().toFields()[0], hours23Before);

            const witness = tree.getWitness(feePayerAccount.toPublicKey().toFields()[0]);

            const txn = await Mina.transaction(feePayerAccount, () => {
                AccountUpdate.fundNewAccount(feePayerAccount)
                zkAppInstance.faucet(feePayerAccount.toPublicKey(), witness, UInt64.from(0))
            });

            await txn.prove();
            await txn.send();

            const accountBalance = Mina.getBalance(feePayerAccount.toPublicKey(), zkAppInstance.token.id).value.toBigInt();
            expect(accountBalance).toEqual(BigInt(10_000));
        })
    })
});
