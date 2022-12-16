import {
    Field,
    PublicKey,
    UInt64,
    Poseidon,
    Struct,
    UInt32
} from "snarkyjs";

export class Bet extends Struct({
    eventId: UInt64,
    betOptionId: UInt32,
    bettorAddress: PublicKey,
    betTokenAmount: UInt64
}) {

    hash(): Field {
        return Poseidon.hash(
            this.eventId.toFields()
                .concat(this.betOptionId.toFields())
                .concat(this.bettorAddress.toFields())
                .concat(this.betTokenAmount.toFields())
        );
    }
}