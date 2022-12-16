import {
    SmartContract,
    method,
    state,
    State,
    Field,
    PublicKey,
    UInt64,
    DeployArgs,
    Permissions,
    MerkleMap,
    MerkleMapWitness,
    Signature,
    Bool,
    UInt32,
} from "snarkyjs";
import { Bet } from "./Bet.js";
import { BetTokenContract } from "./BetTokenContract.js";
import { Entry } from "./Entry.js";
import { Event } from "./Event.js";

const ORACLE_PUBLIC_KEY = "B62qmBUxCXKtJLk8f5Gq8QokE5RRBJPEeqkxwhFGwiotsqvKs37UnSA";

export class BetAppContract extends SmartContract {
    MIN_BET = UInt64.from(100);

    betTokenAddress = PublicKey.fromBase58('B62qmc57uQ4gTsad4pxNCGAjc64GLVGQDr2FxmDraawwiXaWKrFrHks');

    @state(Field) betsTreeRoot = State<Field>();

    @state(PublicKey) oraclePublicKey = State<PublicKey>();

    events = {
        'place-bet': Entry,
    }

    deploy(args: DeployArgs) {
        super.deploy(args);

        const permissionToEdit = Permissions.proofOrSignature();

        this.setPermissions({
            ...Permissions.default(),
            editState: permissionToEdit,
            send: permissionToEdit,
            receive: permissionToEdit,
            editSequenceState: permissionToEdit
        })

        this.betsTreeRoot.set(new MerkleMap().getRoot());
        this.oraclePublicKey.set(PublicKey.fromBase58(ORACLE_PUBLIC_KEY));
    }

    @method reset() {
        this.betsTreeRoot.set(new MerkleMap().getRoot());
    }

    @method placeBet(event: Event, bet: Bet, witness: MerkleMapWitness, signature: Signature) {
        const betsTreeRoot = this.betsTreeRoot.get();
        this.betsTreeRoot.assertEquals(betsTreeRoot);

        const oraclePublicKey = this.oraclePublicKey.get();
        this.oraclePublicKey.assertEquals(oraclePublicKey);

        // Verifying signature
        const validSignature = signature.verify(oraclePublicKey, event.toFields());
        validSignature.assertTrue();

        // // this.network.timestamp.assertBetween(event.betsStartDate, event.betsEndDate);
        // // const now = UInt64.from(Date.now());
        // // now.assertGte(event.betsStartDate);
        // // now.assertLte(event.betsEndDate);

        let isBetFound = Bool(false);
        for (const betOption of event.betOptions) {
            isBetFound = isBetFound.or(betOption.equals(bet.betOptionId));
        }
        isBetFound.assertTrue();

        // Check min bet
        // bet.betTokenAmount.assertGte(this.MIN_BET);

        const betTokenContract = new BetTokenContract(this.betTokenAddress);

        const bettorTokenAmount = betTokenContract.getBalanceOf(bet.bettorAddress);
        bettorTokenAmount.assertGt(bet.betTokenAmount);

        // // Check that the user has not placed a bet
        const [rootBefore, key] = witness.computeRootAndKey(Field(0));
        this.betsTreeRoot.assertEquals(rootBefore);
        key.assertEquals(bet.hash());

        const betTokenAmountField = bet.betTokenAmount.toFields()[0];

        const [rootAfter, _] = witness.computeRootAndKey(betTokenAmountField);
        this.betsTreeRoot.set(rootAfter);

        betTokenContract.transfer(bet.bettorAddress, this.address, bet.betTokenAmount);

        this.emitEvent('place-bet', new Entry({
            key: bet.hash(),
            value: betTokenAmountField
        }));
    }

    @method cancelBet(bet: Bet, witness: MerkleMapWitness) {
        const betsTreeRoot = this.betsTreeRoot.get();
        this.betsTreeRoot.assertEquals(betsTreeRoot);

        // Check that the bet has been placed before
        const [rootBefore, key] = witness.computeRootAndKey(bet.betTokenAmount.toFields()[0]);
        this.betsTreeRoot.assertEquals(rootBefore);
        key.assertEquals(bet.hash());

        const [rootAfter, _] = witness.computeRootAndKey(Field(0));
        this.betsTreeRoot.set(rootAfter)

        const betTokenContract = new BetTokenContract(this.betTokenAddress);

        const bettorTokenAmount = betTokenContract.getBalanceOf(this.address);
        bettorTokenAmount.assertGte(bet.betTokenAmount);

        betTokenContract.transfer(this.address, bet.bettorAddress, bet.betTokenAmount);
    }

    // For now logic is quite simple, just x2 of the initial bet
    @method claimReward(event: Event, winnerBetOption: UInt32, bet: Bet, witness: MerkleMapWitness, signature: Signature) {
        const betsTreeRoot = this.betsTreeRoot.get();
        this.betsTreeRoot.assertEquals(betsTreeRoot);

        const oraclePublicKey = this.oraclePublicKey.get();
        this.oraclePublicKey.assertEquals(oraclePublicKey);

        // Verifying signature
        const validSignature = signature.verify(oraclePublicKey, event.toFields().concat(winnerBetOption.toFields()));
        validSignature.assertTrue();

        // Check that bet was placed
        const [rootBefore, key] = witness.computeRootAndKey(bet.betTokenAmount.toFields()[0]);
        this.betsTreeRoot.assertEquals(rootBefore);
        key.assertEquals(bet.hash());

        const betTokenContract = new BetTokenContract(this.betTokenAddress);

        const bettorTokenAmount = betTokenContract.getBalanceOf(this.address);
        const prize = bet.betTokenAmount.mul(2)
        bettorTokenAmount.assertGte(prize);

        betTokenContract.transfer(this.address, bet.bettorAddress, prize);
    }
}