import {
    Field,
    Struct
} from "snarkyjs";

export class Entry extends Struct({
    key: Field,
    value: Field
}) {

    static empty(): Entry {
        return new Entry({
            key: Field(0),
            value: Field(0)
        });
    }
}