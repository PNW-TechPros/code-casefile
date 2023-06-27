import React from 'preact/compat'; // This just makes VSCode's Intellisense happy
import { $bookmark } from "../../datumPlans";
import { OPEN_BOOKMARK } from "../../messageNames";
import { omit } from 'lodash';
import { messagePoster } from './messageSending';

const LineRef = ({ bookmark }) => (
    <div className="line-ref">
        {$bookmark.file.get(bookmark)}:{$bookmark.line.get(bookmark)}
    </div>
);

const TargetText = ({ bookmark }) => (
    <div className="tagged-content">
        {$bookmark.markText.get(bookmark)}
    </div>
);

const MarkInfo = ({ bookmark }) => {
    const showInEditor = messagePoster(OPEN_BOOKMARK);
    const openThis = () => {
        showInEditor({ bookmark });
    };
    return (
        $bookmark.file.get(bookmark)
        ? (
            <div onClick={openThis}>
                <LineRef bookmark={bookmark}/>
                <TargetText bookmark={bookmark}/>
            </div>
        )
        : <h3>{$bookmark.markText.get(bookmark)}</h3>
    );
};

const Bookmark = ({ tree: treeNode }) => {
    // Eventually, this should be a drag source
    return (
        <div>
            <div className="bookmark"><MarkInfo bookmark={omit(treeNode, 'children')}/></div>
            <div className="bookmark-children">
                {...Array.from(
                    $bookmark.children.getIterable(treeNode),
                    subTree => <Bookmark tree={subTree} key={subTree.id}/>
                )}
            </div>
        </div>
    );
};

export default Bookmark;
