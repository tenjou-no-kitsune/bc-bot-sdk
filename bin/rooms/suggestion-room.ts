import { CommandContext, WithCommands } from "../mixins";
import { ObjStore, parseApiCharObj } from "../utils";
import { GenericMapRoomOptions, MapRoom, MapRoomArguments } from "./map-room";

type Suggestion = {
    on: string,
    from: ReturnType<typeof parseApiCharObj>,
    text: string,
};

type SuggestionsData = {
    suggestions: Suggestion[],
};

export type SuggestionRoomOptions = GenericMapRoomOptions<{
    suggestion: {
        storename: string,
    },
}>;

const MixedMapRoomClass = WithCommands(MapRoom);

export class SuggestionRoom extends MixedMapRoomClass {
    #opts: SuggestionRoomOptions;
    #store: ObjStore<SuggestionsData>;
    #data: SuggestionsData = { suggestions: [] };

    constructor(arg: MapRoomArguments<SuggestionRoomOptions>) {
        super(arg);
        this.#opts = arg.opts;
        
        const { suggestion } = this.#opts;
        this.#store = ObjStore.create({
            name: suggestion.storename,
            data: { default: this.#data },
            file: { path: `store.${suggestion.storename}.json` },
        });
        this.#data = this.#store.load();

        this._cmd.register({
            name: "suggest",
            desc: "leave a suggestion for the map",
            callback: this.#onSuggest.bind(this),
        })
    }

    #onSuggest = (ctx: CommandContext) => {
        console.info(`EVENT(Suggestion/#onSuggest)`, ctx.cmd);
        const text = ctx.cmd.args.join(" ").trim();
        if (text === "") {
            ctx.reply("(suggestion cannot be empty, try again!)");
            return;
        }

        ctx.reply("(noted! thanks for the suggestion!)");
        this.#data.suggestions.push({
            on: new Date().toISOString(),
            from: parseApiCharObj(ctx.sender),
            text: text,
        });
        this.#syncStore();
    }

    #syncStore = () => {
        this.#store.update(this.#data);
    }
}