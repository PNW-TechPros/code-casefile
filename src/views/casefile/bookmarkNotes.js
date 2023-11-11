import React from 'preact/compat'; // This just makes VSCode's Intellisense happy
import { ReactMarkdown } from "react-markdown/lib/react-markdown";
import remarkGfm from "remark-gfm";

export const BookmarkNotes = ({ content, onContentChange }) => {
    return <ReactMarkdown 
        children={content}
        remarkPlugins={[remarkGfm]}
    />;
};
