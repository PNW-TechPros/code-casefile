import React, { useEffect, useMemo, useRef } from 'preact/compat';
import ReactMarkdown from 'react-markdown';
import remarkGfm from "remark-gfm";
import { vscontext } from '../helpers';
import { messagePoster } from './messageSending';
import { SET_NOTES_DISPLAYING } from '../../messageNames';

export const BookmarkNotes = ({ itemPath, content, noteState = {} }) => {
    const mountTime = useMemo(() => Date.now(), []);
    const sendNoteDisplayState = messagePoster(SET_NOTES_DISPLAYING);
    useEffect(() => {
        sendNoteDisplayState({ displaying: true });
        return () => {
            sendNoteDisplayState({ displaying: false });
        };
    }, []);

    if (!(noteState.editingStarted >= mountTime)) {
        const noteClicked = (event) => {
            // If not the second click of a double-click, ignore this
            if (event.detail !== 2) {
                return true;
            }
            noteState?.startEdit();
        };
        return <div
            className="bookmark-notes-content"
            {...vscontext({
                webviewArea: 'bookmarkNotes',
                itemPath,
            })}
            tabIndex="1"
            onClick={noteClicked}
        >
            <ReactMarkdown
                children={content}
                remarkPlugins={[remarkGfm]}
            />
        </div>;
    } else {
        const markdownEditorRef = useRef(null);
        function acceptNewContent() {
            noteState?.updateNote(itemPath, markdownEditorRef.current.value);
        };
        return <div className="bookmark-notes-content editor">
            <div className="controls">
                <i className="codicon codicon-check accept-bookmark-notes"
                    onClick={acceptNewContent}/>
                <i className="codicon codicon-close forsake-bookmark-notes"
                    onClick={() => noteState?.cancelEdit()}/>
            </div>
            <textarea className="content-editor" ref={markdownEditorRef}
                defaultValue={content}
            />
        </div>;
    }
};