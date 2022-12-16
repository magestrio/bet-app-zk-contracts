import {
    Field,
    UInt64,
    Poseidon,
    Struct,
    UInt32,
} from "snarkyjs";

export class Event extends Struct({
    id: UInt64,
    betsStartDate: UInt64,
    betsEndDate: UInt64,
    betOptions: [UInt32, UInt32, UInt32]
}) {

    hash(): Field {
        return Poseidon.hash(
            this.toFields()
        );
    }

    toFields(): Field[] {
        return this.id.toFields()
            .concat(this.betsStartDate.toFields())
            .concat(this.betsEndDate.toFields())
            .concat(this.betOptions.map(betOption => betOption.toFields()[0]));
    }
}