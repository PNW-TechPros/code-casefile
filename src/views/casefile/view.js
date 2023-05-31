import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import getMessageHandlers from './receivedMessages';
import { thru } from 'lodash';

const vscode = acquireVsCodeApi();

const View = () => {
    const [state, setState] = useState({});

    useEffect(() => thru(
        getMessageHandlers({ getState: () => state, setState }),
        handlers => {
            const handleEvent = (event) => handlers.dispatch(event.data);
            window.addEventListener('message', handleEvent);
            return () => window.removeEventListener('message', handleEvent);
        }
    ), []);

    return (
        <div>
            Preact app
        </div>
    );
};

render(<View />, document.body);
