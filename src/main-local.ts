import {
    Mina,
    isReady,
    PublicKey,
    PrivateKey,
    AccountUpdate,
    Field,
    shutdown,
    Circuit,
    Poseidon,
    UInt64
} from 'snarkyjs';

import { getUsers, mapToTree, setUsers } from './offChainStorage.js';

import XMLHttpRequestTs from 'xmlhttprequest-ts';
import { BetTokenContract } from './BetTokenContract.js';
import { Entry } from './Entry.js';
const NodeXMLHttpRequest =
    XMLHttpRequestTs.XMLHttpRequest as any as typeof XMLHttpRequest;

(async function main() {
    console.log('Loading snarky js')
    await isReady;

    // ----------------------------------------

    console.log('Setting up blockchain')
    const Local = Mina.LocalBlockchain({ proofsEnabled: false });
    Mina.setActiveInstance(Local);

    let feePayerKey: PrivateKey = Local.testAccounts[0].privateKey;

    let zkappPrivateKey: PrivateKey = PrivateKey.fromBase58('EKEV3xCNi92L46buQiT9q3pzo4tZiNNfDjeG2JRKzvZrr8Yofxad');
    let zkappPublicKey: PublicKey = zkappPrivateKey.toPublicKey();

    const storageServerAddress = 'http://localhost:3001';
    
    const betTokenContract = new BetTokenContract(zkappPrivateKey.toPublicKey());

    console.log('deploying...')
    const deploy_txn = await Mina.transaction(feePayerKey, () => {
        AccountUpdate.fundNewAccount(feePayerKey);
        betTokenContract.deploy({ zkappKey: zkappPrivateKey });
    })

    await deploy_txn.prove();
    await deploy_txn.send();

    console.log('getting users...');

    let usersMap = await getUsers(
        storageServerAddress,
        zkappPublicKey,
        NodeXMLHttpRequest
    );

    let usersTree = mapToTree(usersMap);
    let hashedPublicKey = Poseidon.hash(feePayerKey.toPublicKey().toFields())
    let findValue = usersMap.find((element) => Field(element.key).equals(hashedPublicKey))?.value || 0
    let valueField = Field(findValue);

    Circuit.log('value = ', findValue)
    let witness = usersTree.getWitness(hashedPublicKey);

    // Faucet user with BET tokens

    console.log('Fauceting...')
    const faucet_txn = await Mina.transaction(feePayerKey, () => {
        AccountUpdate.fundNewAccount(feePayerKey);
        betTokenContract.faucet(
            feePayerKey.toPublicKey(),
            witness,
            UInt64.from(valueField)
        )
    });

    await faucet_txn.prove();
    await faucet_txn.send();

    console.log('Fetching events ...')
    let events = await betTokenContract.fetchEvents();
    let latestEvent = events[events.length - 1].event;

    let entry: Entry = JSON.parse(JSON.stringify(latestEvent));
    console.log('fetched event = ', entry)

    console.log('Sending user to the server')

    usersMap.push({
        key: entry.key.toString(),
        value: entry.value.toString()
    });

    console.log('key', entry.key);
    console.log('value', entry.value)

    await setUsers(
        storageServerAddress,
        zkappPublicKey,
        usersMap,
        NodeXMLHttpRequest
    );

    // update users
    usersMap = await getUsers(
        storageServerAddress,
        zkappPublicKey,
        NodeXMLHttpRequest
    );

    usersTree = mapToTree(usersMap);
    hashedPublicKey = Poseidon.hash(feePayerKey.toPublicKey().toFields())

    findValue = usersMap.find((element) => Field(element.key).equals(hashedPublicKey))?.value || 0
    valueField = Field(findValue);

    Circuit.log('value = ', valueField)
    witness = usersTree.getWitness(valueField);

    console.log('Fauceting...')
    const faucet_txn_1 = await Mina.transaction(feePayerKey, () => {
        betTokenContract.faucet(
            feePayerKey.toPublicKey(),
            witness,
            UInt64.from(valueField)
        )
    });

    await faucet_txn_1.prove();
    await faucet_txn_1.send();

    console.log('Fetching events ...')
    events = await betTokenContract.fetchEvents();
    latestEvent = events[events.length - 1].event;

    entry = JSON.parse(JSON.stringify(latestEvent));
    console.log('fetched event = ', entry)

    console.log('Sending user to the server')
    usersMap.push({
        key: entry.key.toString(),
        value: entry.value.toString()
    });

    await setUsers(
        storageServerAddress,
        zkappPublicKey,
        usersMap,
        NodeXMLHttpRequest
    );

    console.log('shutdown')

    await shutdown();
})()