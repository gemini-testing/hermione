"use strict";

const Callstack = require("./callstack");
const cmds = require("./commands");
const { runWithHooks, normalizeCommandArgs, historyDataMap } = require("./utils");

const shouldNotWrapCommand = (commandName) => [
    "addCommand",
    "overwriteCommand",
    "extendOptions",
    "setMeta",
    "getMeta",
].includes(commandName);

const mkNodeData = ({ name, args, elementScope, key, overwrite }) => {
    const map = {
        [historyDataMap.NAME]: name,
        [historyDataMap.ARGS]: normalizeCommandArgs(name, args),
        [historyDataMap.SCOPE]: cmds.createScope(elementScope),
        [historyDataMap.KEY]: key,
    };

    if (overwrite) {
        map[historyDataMap.IS_OVERWRITTEN] = Number(overwrite);
    }

    return map;
};

const overwriteAddCommand = (session, callstack) => session
    .overwriteCommand("addCommand", (origCommand, name, wrapper, elementScope) => {
        if (shouldNotWrapCommand(name)) {
            return origCommand(name, wrapper, elementScope);
        }

        function decoratedWrapper(...args) {
            const key = Symbol();

            return runWithHooks({
                before: () => callstack.enter(mkNodeData({ name, args, elementScope, key, overwrite: false })),
                fn: () => wrapper.apply(this, args),
                after: () => callstack.leave(key),
            });
        }

        return origCommand(name, decoratedWrapper, elementScope);
    });

const overwriteOverwriteCommand = (session, callstack) => session
    .overwriteCommand("overwriteCommand", (origCommand, name, wrapper, elementScope) => {
        if (shouldNotWrapCommand(name)) {
            return origCommand(name, wrapper, elementScope);
        }

        function decoratedWrapper(origFn, ...args) {
            const key = Symbol();

            return runWithHooks({
                before: () => callstack.enter(mkNodeData({ name, args, elementScope, key, overwrite: true })),
                fn: () => wrapper.apply(this, [origFn, ...args]),
                after: () => callstack.leave(key),
            });
        }

        return origCommand(name, decoratedWrapper, elementScope);
    });

const overwriteCommands = ({ session, callstack, commands, elementScope }) => commands.forEach((name) => {
    function decoratedWrapper(origFn, ...args) {
        const key = Symbol();

        return runWithHooks({
            before: () => callstack.enter(mkNodeData({ name, args, elementScope, key, overwrite: false })),
            fn: () => origFn(...args),
            after: () => callstack.leave(key),
        });
    }

    session.overwriteCommand(name, decoratedWrapper, elementScope);
});

const overwriteBrowserCommands = (session, callstack) => overwriteCommands({
    session,
    callstack,
    commands: cmds.getBrowserCommands(),
    elementScope: false,
});

const overwriteElementCommands = (session, callstack) => overwriteCommands({
    session,
    callstack,
    commands: cmds.getElementCommands(),
    elementScope: true,
});

exports.initCommandHistory = (session) => {
    const callstack = new Callstack();

    overwriteAddCommand(session, callstack);
    overwriteBrowserCommands(session, callstack);
    overwriteElementCommands(session, callstack);
    overwriteOverwriteCommand(session, callstack);

    return callstack;
};
