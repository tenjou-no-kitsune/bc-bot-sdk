import { CommandHandlerTexts } from "../../mixins";

namespace Help {
    export const exports = {
        /** @desc ~ a help text formatter with roles capability built-in */
        createTextFormatter: (opts: {
            texts: {
                help_title: string,
                public_role_name: string,
            },
            templates: {
                cmd_to_text: (prefix: string, name: string, desc: string) => string,
                role_title: (role: string) => string,
            }
        }): CommandHandlerTexts["help"]["getHelpText"] => {
            return (ctx, cmds) => {
                const cmd_to_text = (cmd: typeof cmds[number]) =>
                    opts.templates.cmd_to_text(ctx.cmd.prefix, cmd.name, cmd.desc);

                const texts: string[] = [];
                if (ctx.roles.length) {
                    const privilegedCmds = cmds
                        .filter(c => ctx.roles.some(r => c.roles.has(r)))
                        .reduce<Record<string, Mutable<typeof cmds>>>((acc, c) => {
                            if (!c.roles.main) return acc;
                            if (!(c.roles.main in acc))
                                acc[c.roles.main] = [];
                            acc[c.roles.main].push(c);
                            return acc;
                        }, {});
                    Object.entries(privilegedCmds).forEach(([role, cmds]) =>
                        texts.push(
                            opts.templates.role_title(role),
                            ...cmds.map(cmd_to_text),
                        )
                    );
                    texts.push(opts.templates.role_title(opts.texts.public_role_name));
                }
                return [
                    opts.texts.help_title,
                    ...texts,
                    ...cmds.filter(c => !c.roles.size).map(cmd_to_text),
                ];
        };
        },
    };
}
export const help = Help.exports;
