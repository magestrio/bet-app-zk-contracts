import {
    SmartContract,
    method,
    state,
    State,
    Field,
    PublicKey,
    UInt64,
    MerkleMapWitness,
    DeployArgs,
    Permissions,
    MerkleMap,
    AccountUpdate,
    Experimental,
    Int64,
    Circuit,
    Reducer,
    Bool,
    Struct,
    Signature,
    Poseidon
} from "snarkyjs";

const tokenSymbol = 'BET'

class Entry extends Struct({
    key: Field,
    value: Field
}) {

    static empty(): Entry {
        Signature.fromJSON(Field(0));
        return new Entry({
            key: Field(0),
            value: Field(0)
        });
    }
}

class Action extends Struct({
    key: Field,
    value: Field,
    computedWitnessRoot: Field
}) {

    static empty() {
        return new Action({
            key: Field(0),
            value: Field(0),
            computedWitnessRoot: Field(0)
        });
    }
}

export class BetTokenContract extends SmartContract {
    FAUCET_TOKEN_AMOUNT = UInt64.from(100_000);

    reducer = Reducer({ actionType: Action })

    @state(UInt64) totalAmountInCirculation = State<UInt64>();
    @state(Field) faucetUsersTreeRoot = State<Field>();
    @state(Field) accumulatedFaucetedUsers = State<Field>();

    events = {
        'faucet': Entry
    }

    deploy(args: DeployArgs) {
        super.deploy(args);

        const permissionToEdit = Permissions.proofOrSignature();

        this.setPermissions({
            ...Permissions.default(),
            editState: permissionToEdit,
            setTokenSymbol: permissionToEdit,
            send: permissionToEdit,
            receive: permissionToEdit,
            editSequenceState: permissionToEdit
        })
    }

    init() {
        super.init();
        Circuit.log('init')
        this.faucetUsersTreeRoot.set(new MerkleMap().getRoot())
        this.tokenSymbol.set(tokenSymbol);
        this.accumulatedFaucetedUsers.set(Reducer.initialActionsHash);
    }

    @method deployBetApp(address: PublicKey) {
        let tokenId = this.token.id;
        let zkapp = AccountUpdate.create(address, tokenId);
        zkapp.balance.addInPlace(100_000)
        this.approve(zkapp);

        AccountUpdate.setValue(zkapp.update.permissions, Permissions.default());
        // AccountUpdate.setValue(zkapp.update.verificationKey, verificationKey);
        zkapp.requireSignature();
    }

    @method reset() {
        this.faucetUsersTreeRoot.set(new MerkleMap().getRoot());
    }

    @method faucet(receiverAddress: PublicKey, witness: MerkleMapWitness, lastTimeFaucet: UInt64) {
        const faucetUsersTreeRoot = this.faucetUsersTreeRoot.get();
        this.faucetUsersTreeRoot.assertEquals(faucetUsersTreeRoot);

        // // Check if 24 hours passed since last faucet / or the user has never faucet before
        const nextMinFaucetTime = Circuit.if(lastTimeFaucet.equals(UInt64.zero), UInt64.zero, lastTimeFaucet.add(60 * 60 * 1000))
        this.network.timestamp.assertBetween(nextMinFaucetTime, UInt64.MAXINT());

        // UInt64.from(Date.now()).assertGt(lastTimeFaucet.add(60 * 60 * 1000))

        const [rootBefore, key] = witness.computeRootAndKey(lastTimeFaucet.toFields()[0]);
        // Workaround as during the init method execution field is 0
        rootBefore.assertEquals(Circuit.if(faucetUsersTreeRoot.equals(Field(0)), new MerkleMap().getRoot(), faucetUsersTreeRoot));
        const userKey = Poseidon.hash(receiverAddress.toFields());
        key.assertEquals(userKey);

        const now = this.network.timestamp.get();
        this.network.timestamp.assertBetween(now, UInt64.MAXINT());

        const [rootAfter, _] = witness.computeRootAndKey(now.toFields()[0])
        this.faucetUsersTreeRoot.set(rootAfter);

        // getAction does not work for berkeley

        // const newAction = new Action({
        //     key: userKey,
        //     value: now.toFields()[0],
        //     computedWitnessRoot: rootAfter
        // })
        // const accumulatedFaucetedUsers = this.accumulatedFaucetedUsers.get();
        // this.accumulatedFaucetedUsers.assertEquals(accumulatedFaucetedUsers);
        // let { state: isFauceted } = this.reducer.reduce(
        //     this.reducer.getActions({
        //         fromActionHash: accumulatedFaucetedUsers,
        //     }),
        //     Bool,
        //     (state: Bool, action: Action) => {
        //         return action.key.equals(newAction.key).or(state);
        //     },
        //     { state: Bool(false), actionsHash: accumulatedFaucetedUsers }
        // );

        // this.reducer.dispatch(Circuit.if(isFauceted, Action.empty(), newAction));

        // const mintAmount = Circuit.if(isFauceted, UInt64.zero, this.FAUCET_TOKEN_AMOUNT);

        this.token.mint({
            address: receiverAddress,
            amount: this.FAUCET_TOKEN_AMOUNT,
        });

        this.emitEvent('faucet', new Entry({
            key: userKey,
            value: Field(Date.now())
        }))
    }

    // Useless for berkery until getAction does not work
    @method rollUp() {
        const faucetUsersTreeRoot = this.faucetUsersTreeRoot.get();
        this.faucetUsersTreeRoot.assertEquals(faucetUsersTreeRoot);

        const accumulatedFaucetedUsers = this.accumulatedFaucetedUsers.get();
        this.accumulatedFaucetedUsers.assertEquals(accumulatedFaucetedUsers);

        let { state: newFaucetUsers, actionsHash: newAccumulatedFaucetedUsers } =
            this.reducer.reduce(
                this.reducer.getActions({
                    fromActionHash: accumulatedFaucetedUsers
                }),
                Field,
                (state: Field, action: Action) => {
                    let isEmpty = Circuit.if(
                        action.key.equals(Field(0)),
                        Bool(true),
                        Bool(false)
                    );

                    // this.emitEvent('faucet', new Entry({
                    //     key: action.key,
                    //     // value: action.value
                    // }))

                    return Circuit.if(isEmpty, state, action.computedWitnessRoot);
                },
                { state: faucetUsersTreeRoot, actionsHash: accumulatedFaucetedUsers }
            )

        this.faucetUsersTreeRoot.set(newFaucetUsers);
        this.accumulatedFaucetedUsers.set(newAccumulatedFaucetedUsers);
    }

    @method approveSendingTokens(
        zkappUpdate: AccountUpdate,
        receiverAddress: PublicKey,
        amount: UInt64
    ) {
        this.approve(zkappUpdate);

        let negativeAmount = Int64.fromObject(
            zkappUpdate.body.balanceChange
        );

        negativeAmount.assertEquals(Int64.from(amount).neg());

        let tokenId = this.token.id;

        let receiverAccountUpdate = Experimental.createChildAccountUpdate(
            this.self,
            receiverAddress,
            tokenId
        );

        receiverAccountUpdate.balance.addInPlace(amount);
    }

    @method getBalanceOf(owner: PublicKey): UInt64 {
        let accountUpdate = AccountUpdate.create(owner, this.token.id);
        let balance = accountUpdate.account.balance.get();
        accountUpdate.account.balance.assertEquals(balance);
        return balance;
    }

    @method transfer(from: PublicKey, to: PublicKey, value: UInt64) {
        this.token.send({ from, to, amount: value });
    }
}