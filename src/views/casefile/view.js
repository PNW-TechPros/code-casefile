import { render } from 'preact';
import React from 'preact/compat'; // This just makes VSCode's Intellisense happy
import { useEffect, useState } from 'preact/hooks';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import getMessageHandlers from './receivedMessages';
import { thru } from 'lodash';
import { $casefile } from '../../datumPlans';
import Bookmark from './bookmark';
import "./view.css";
import { MessagePasser } from './messageSending';

const vscode = acquireVsCodeApi();

const View = () => {
    const [state, setState] = thru(
        useState(vscode.getState() || {}),
        ([state, setState]) => [state, (newState) => {setState(newState); vscode.setState(newState);}]
    );

    useEffect(() => thru(
        getMessageHandlers({ context: { getState: () => state, setState } }),
        handlers => {
            const handleEvent = (event) => {
                handlers.dispatch(event.data);
            };
            window.addEventListener('message', handleEvent);
            return () => window.removeEventListener('message', handleEvent);
        }
    ), []);

    return (
        <MessagePasser value={(data) => {vscode.postMessage(data);}}>
            <DndProvider backend={HTML5Backend}>
                <div className="casefile-ui">
                    <div className="bookmarks-forest">
                        {...Array.from(
                            $casefile.bookmarks.getIterable(state),
                            bookmark => <Bookmark tree={bookmark} key={bookmark.id}/>
                        )}
                    </div>
                </div>
            </DndProvider>
        </MessagePasser>
    );
};

render(<View />, document.body);
