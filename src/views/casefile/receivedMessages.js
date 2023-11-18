import { thru } from 'lodash';
import { newEvent } from '../eventStream';

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

export const applicationOfMessagesToState = (state, setState) => {
    return () => thru(
        getMessageHandlers({ context: { getState: () => state, setState } }),
        handlers => {
            const handleEvent = (event) => {
                handlers.dispatch(event.data);
            };
            window.addEventListener('message', handleEvent);
            return () => window.removeEventListener('message', handleEvent);
        }
    );
};


///////////////////////// MESSAGE HANDLERS /////////////////////////

handleExtensionMessage('setViewState', ({ value }, context) => {
    if (!value) {
        return;
    }
    context.setState(value);
});

handleExtensionMessage('editNotes', (_, context) => {
    const currentState = context.getState();
    context.setState({
        ...currentState,
        noteEditorOpened: newEvent({ state: true }),
    });
});
