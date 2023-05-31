import { $bookmark } from "../../datumPlans";

const Bookmark = ({ tree }) => {
    return (
        <div>
            <div>
                {$bookmark.markText.get(tree)}
            </div>
            <div class="bookmark-children">
                {...Array.from(
                    $bookmark.children.getIterable(tree),
                    subTree => <Bookmark tree={subTree} key={subTree.id}/>
                )}
            </div>
        </div>
    );
};

export default Bookmark;
