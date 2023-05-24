import { h, render } from 'preact';
import { useState } from 'preact/hooks';

/** @jsx h */

const vscode = acquireVsCodeApi();

const MESSAGE_HANDLERS = new Map();
function handleExtensionMessage(type, handler) {
    const existing = MESSAGE_HANDLERS.get(type);
    if (existing) {
        throw Object.assign(new Error(`Second registration of '${type}' handler`), {
            ["first registration"]: existing.registration,
        });
    }
    MESSAGE_HANDLERS.set(type, { handler, registration: new Error(`First registration of '${type}' handler`) });
}

window.addEventListener('message', event => {
    const message = event.data; // The json data that the extension sent
    const handler = (MESSAGE_HANDLERS.get(type)?.handler || ((data) => {
        console.error(`Invalid message type '${type}' received: %O`, data);
    }));
    handler(message);
});

const App = () => {
    const [state, setState] = useState({});

    return (
        <div>
            Preact app
        </div>
    );
};

render(<App />, document.body);
