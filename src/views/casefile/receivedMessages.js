const MESSAGE_HANDLERS = new Map();
function handleExtensionMessage(type, handler) {
    const existing = MESSAGE_HANDLERS.get(type);
    if (existing) {
        throw Object.assign(new Error(`Second registration of '${type}' handler`), {
            ["first registration"]: existing.registration,
        });
    }
    MESSAGE_HANDLERS.set(type, {
        handler,
        registration: new Error(`First registration of '${type}' handler`),
    });
}
const getMessageHandlers = ({ context }) => {
    const handlers = new Map();
    for (const [type, { handler }] of MESSAGE_HANDLERS) {
        handlers.set(type, handler);
    }
    return {
        dispatch(data) {
            const handler = handlers.get(data?.type) || (() => {
                console.error(`Unhandled message type '${data?.type}' received: %O`, data);
            });
            handler(data, context);
        },
    };
};

export default getMessageHandlers;

///////////////////////// MESSAGE HANDLERS /////////////////////////

handleExtensionMessage('setViewState', ({ value }, context) => {
    if (!value) {
        return;
    }
    context.setState(value);
});
