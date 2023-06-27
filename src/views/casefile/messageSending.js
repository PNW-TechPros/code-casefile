import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import * as messageNames from '../../messageNames';

const POST_MESSAGE = createContext((data) => {
    console.error(`No message provider for sending: %O`, data);
});

export const MessagePasser = POST_MESSAGE.Provider;

export function messagePoster(type) {
    type = '' + type;
    if (!Object.values(messageNames).includes(type)) {
        throw new Error(`Unknown Casefile message '${type}'`);
    }
    const postMessage = useContext(POST_MESSAGE);
    return (data) => {
        // TODO: Validate structure of *data*
        postMessage({...data, type});
    };
}
