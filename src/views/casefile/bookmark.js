import React from 'preact/compat'; // This just makes VSCode's Intellisense happy
import { $bookmark } from "../../datumPlans";
import { OPEN_BOOKMARK } from "../../messageNames";
import { omit, thru } from 'lodash';
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

const FOLDING_ICON_MAP = {
    'collapsed': 'chevron-right',
    'expanded': 'chevron-down',
    'default': 'blank',
};
const MarkInfo = ({ bookmark, folding }) => {
    const showInEditor = messagePoster(OPEN_BOOKMARK);
    const openThis = () => {
        showInEditor({ bookmark });
    };
    const markContent = (
        $bookmark.file.get(bookmark)
        ? (
            <div onClick={openThis}>
                <LineRef bookmark={bookmark}/>
                <TargetText bookmark={bookmark}/>
            </div>
        )
        : <h3>{$bookmark.markText.get(bookmark)}</h3>
    );
    const controls = [
        <i className="codicon codicon-gripper"></i>
    ];
    const foldingIcon = FOLDING_ICON_MAP[folding];
    if (foldingIcon && folding !== 'default') {
        controls.push(<i className={`codicon codicon-${foldingIcon}`}></i>);
    } else {
        controls.push(<i className={`codicon codicon-${FOLDING_ICON_MAP.default}`}></i>);
    }

    return (
        <>
            <div className="controls">{controls}</div>
            <div className="content">
                {markContent}
            </div>
        </>
    );
};

const Bookmark = ({ tree: treeNode }) => {
    // Eventually, this should be a drag source
    const collapsed = $bookmark.collapsed.get(treeNode);
    const shownChildren = (
        collapsed
        ? []
        : Array.from(
            $bookmark.children.getIterable(treeNode),
            subTree => <Bookmark tree={subTree} key={subTree.id}/>
        )
    );
    const folding = thru(null, () => {
        if (!$bookmark.children.length(treeNode)) {
            return 'none';
        }
        if (collapsed) {
            return 'collapsed';
        }
        return 'expanded';
    });
    return (
        <div className="bookmark">
            <MarkInfo bookmark={omit(treeNode, ['children'])} {...{ folding }}/>
            {...shownChildren}
        </div>
    );
};

export default Bookmark;
