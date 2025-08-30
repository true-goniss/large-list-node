class Logger {

    constructor() {

    }

    Log(...args) {

        const loggingEnabled = args[args.length - 1];
        if (typeof loggingEnabled === 'boolean' && loggingEnabled) {
            console.log(...args.slice(0, -1));
        }
    }
}

module.exports = { Logger };