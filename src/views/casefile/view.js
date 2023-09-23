import { render } from 'preact';
import React from 'preact/compat'; // This just makes VSCode's Intellisense happy
import { useEffect, useRef, useState } from 'preact/hooks';
import { DndProvider, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { applicationOfMessagesToState } from './receivedMessages';
import { thru } from 'lodash';
import { EnterAndExitTransition } from '@devclusters/fluency';
import { $casefile } from '../../datumPlans';
import Bookmark from './bookmark';
import "./view.css";
import { MessagePasser, messagePoster } from './messageSending';
import { DRAG_TYPES } from './constants';
import { vscontext, NO_STD_CMENU_ENTRIES } from '../helpers';
import { DELETE_BOOKMARK, REQUEST_INITIAL_FILL } from '../../messageNames';

const vscode = acquireVsCodeApi();

const BindMessageHandling = ({ stateManagement }) => {
    useEffect(applicationOfMessagesToState(...stateManagement), []);
    return null;
};

const RequestInitialData = ({ children }) => {
    const requestInitialData = messagePoster(REQUEST_INITIAL_FILL);
    useEffect(() => {
        requestInitialData({});
    }, []);
    return <>{ children }</>;
};

const useDragging = () => {
    const [dragging, setDragging] = useState(false);
    const dragWatcher = useRef();
    useEffect(() => {
        const node = dragWatcher.current;
        const listeners = [
            ['dragstart',   () => { setDragging(true); },   true],
            ['dragend',     () => { setDragging(false); },  false],
        ];
        for (const listenArgs of listeners) {
            node.addEventListener(...listenArgs);
        }
        // Remove listeners when unmounted
        return () => {
            for (const listenArgs of listeners) {
                node.removeEventListener(...listenArgs);
            }
        };
    }, []);

    return [dragging, dragWatcher];
};

const Trash = () => {
    const deleteBookmark = messagePoster(DELETE_BOOKMARK);
    const [, trashDrop] = useDrop(() => ({
        accept: [DRAG_TYPES.BOOKMARK],
        drop: ({ itemPath }) => {
            deleteBookmark({ itemPath });
        },
    }));

    return (
        <div className="bookmark-trash" ref={trashDrop}>
            <div><i className="codicon codicon-trash"></i><span> Remove</span></div>
        </div>
    );
};

const View = () => {
    const [dragging, dragWatcherRef] = useDragging();
    const stateManagement = useState({}), [ state ] = stateManagement;

    return (
        <MessagePasser value={(data) => {vscode.postMessage(data);}}>
            <RequestInitialData>
                <BindMessageHandling {...{ stateManagement }} />
            </RequestInitialData>
            <DndProvider backend={HTML5Backend}>
                <div className="casefile-ui" ref={dragWatcherRef} {...vscontext(NO_STD_CMENU_ENTRIES)}>
                    <div className="bookmarks-forest">
                        {...Array.from(
                            $casefile.bookmarks.getIterable(state),
                            bookmark => <Bookmark tree={bookmark} key={bookmark.id}/>
                        )}
                    </div>
                    <EnterAndExitTransition
                        triggerEnter={dragging}
                        triggerExit={!dragging}
                        transitionNameEnter='slideInDown'
                        transitionNameExit='slideOutUp'
                    >
                        <Trash/>
                    </EnterAndExitTransition>
                </div>
            </DndProvider>
        </MessagePasser>
    );
};

render(<View />, document.body);

