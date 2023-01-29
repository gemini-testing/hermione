"use strict";

const _ = require("lodash");
const { historyDataMap } = require("./utils");

module.exports = class Callstack {
    constructor() {
        this._history = [];
        this._stack = [];
    }

    enter(data) {
        this._stack.push({
            ...data,
            [historyDataMap.TIME_START]: Date.now(),
            [historyDataMap.CHILDREN]: [],
        });
    }

    leave(key) {
        const currentNodeIndex = _.findLastIndex(this._stack, node => node[historyDataMap.KEY] === key);
        const wasRemovedByParent = currentNodeIndex === -1;

        if (wasRemovedByParent) {
            return;
        }

        const removedNodes = this._stack.splice(currentNodeIndex);
        const currentNode = _.first(removedNodes);
        const parentNode = _.last(this._stack);
        const isCurrentNodeRoot = this._stack.length === 0;

        currentNode[historyDataMap.TIME_END] = Date.now();
        currentNode[historyDataMap.DURATION] = currentNode[historyDataMap.TIME_END] - currentNode[historyDataMap.TIME_START];

        isCurrentNodeRoot
            ? this._history.push(currentNode)
            : parentNode[historyDataMap.CHILDREN].push(currentNode);
    }

    flush() {
        const history = this._history;

        this._stack = [];
        this._history = [];

        return history;
    }
};
