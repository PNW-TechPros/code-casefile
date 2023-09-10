import { render } from 'preact';
import React from 'preact/compat'; // This just makes VSCode's Intellisense happy
import { useEffect, useRef, useState } from 'preact/hooks';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { applicationOfMessagesToState } from './receivedMessages';
import { thru } from 'lodash';
import { EnterAndExitTransition } from '@devclusters/fluency';
import { $casefile } from '../../datumPlans';
import Bookmark from './bookmark';
import "./view.css";
import { MessagePasser } from './messageSending';

const vscode = acquireVsCodeApi();

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

const Null = ({ children }) => (<>{ children }</>);

const View = () => {
    const [state, setState] = thru(
        useState(vscode.getState() || {}),
        ([state, setState]) => [state, (newState) => {setState(newState); vscode.setState(newState);}]
    );
    useEffect(applicationOfMessagesToState(state, setState), []);

    const [dragging, dragWatcherRef] = useDragging();

    return (
        <MessagePasser value={(data) => {vscode.postMessage(data);}}>
            <DndProvider backend={HTML5Backend}>
                <div className="casefile-ui" ref={dragWatcherRef}>
                    <div className="bookmarks-forest">
                        {...Array.from(
                            $casefile.bookmarks.getIterable(state),
                            bookmark => <Bookmark tree={bookmark} key={bookmark.id}/>
                        )}
                    </div>
                    <Null
                        triggerEnter={dragging}
                        triggerExit={!dragging}
                        transitionNameEnter='slideInDown'
                        transitionNameExit='slideOutUp'
                    >
                        <div className="bookmark-trash">
                            <div><i className="codicon codicon-trash"></i><span> Remove</span></div>
                        </div>
                    </Null>
                </div>
            </DndProvider>
        </MessagePasser>
    );
};

render(<View />, document.body);

