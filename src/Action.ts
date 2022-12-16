import {
    Field,
    Struct
} from "snarkyjs";

export class Action extends Struct({
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