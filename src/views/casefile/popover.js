import { cloneElement, createContext, isValidElement } from 'preact';
import React from 'preact/compat'; // This just makes VSCode's Intellisense happy
import { FloatingArrow, FloatingFocusManager, FloatingPortal, arrow, autoUpdate, flip, offset, shift, useClick, useDismiss, useFloating, useInteractions, useMergeRefs, useRole } from '@floating-ui/react';
import { useContext, useId, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { forwardRef } from 'preact/compat';
import { isString } from 'lodash';

const OFFSET = 5;

export const usePopover = ({
    arrowRef,
    initialOpen = false,
    placement = 'bottom',
    preferOnCrossAxis, // 'start' or 'end'
    modal,
    offset: offset_ = OFFSET,
    open: controlledOpen,
    onOpenChange: setControlledOpen,
} = {}) => {
    const [uncontrolledOpen, setUncontrolledOpen] = useState(initialOpen);
    const [labelId, setLabelId] = useState();
    const [descriptionId, setDescriptionId] = useState();

    const open = controlledOpen ?? uncontrolledOpen;
    const setOpen = setControlledOpen ?? setUncontrolledOpen;

    const data = useFloating({
        placement,
        open,
        onOpenChange: setOpen,
        whileElementsMounted: autoUpdate,
        middleware: [
            offset(offset_),
            flip({
                crossAxis: placement.includes('-'),
                fallbackAxisSideDirection: preferOnCrossAxis ?? 'none',
                padding: 5,
            }),
            shift({
                padding: 5,
            }),
            ...(
                arrowRef
                ? [arrow({ element: arrowRef })]
                : []
            ),
        ],
    });

    const { context } = data;

    const click = useClick(context, {
        // eslint-disable-next-line eqeqeq
        enabled: controlledOpen == null,
    });
    const dismiss = useDismiss(context);
    const role = useRole(context);

    const interactions = useInteractions([click, dismiss, role]);

    return useMemo(
        () => ({
            open,
            setOpen,
            ...interactions,
            ...data,
            modal,
            labelId,
            descriptionId,
            setLabelId,
            setDescriptionId,
        }),
        [open, setOpen, interactions, data, modal, labelId, descriptionId]
    );
};

const PopoverContext = createContext(null);

export const usePopoverContext = () => {
    const context = useContext(PopoverContext);

    // eslint-disable-next-line eqeqeq
    if (context == null) {
        throw new Error("Popover components must be wrapped in <Popover />");
    }

    return context;
};

export const Popover = ({
    arrowAspectRatio = 1,
    children,
    modal = false,
    offset: offset_ = OFFSET,
    useArrow = false,
    ...props
}) => {
    const arrowRef = useArrow ? useRef(null) : undefined;
    const popover = usePopover({ modal, offset: offset_, ...props, arrowRef });
    if (useArrow) {
        const outlineColor = isString(useArrow) ? useArrow : undefined;
        popover.popoverArrow = <FloatingArrow
            ref={arrowRef}
            context={popover.context}
            width={offset_ * 2 * arrowAspectRatio}
            height={offset_}
            fill={outlineColor}
        />;
        popover.popoverOutline = outlineColor;
    }
    return (
        <PopoverContext.Provider value={popover}>
            {children}
        </PopoverContext.Provider>
    );
};

export const PopoverTrigger = forwardRef(({ children, asChild = false, ...props }, refToMe) => {
    const context = usePopoverContext();
    const childrenRef = children.ref;
    const ref = useMergeRefs([context.refs.setReference, refToMe, childrenRef]);
    const popoverState = context.open ? "open" : "closed";

    if (asChild && isValidElement(children)) {
        return cloneElement(
            children,
            context.getReferenceProps({
                ref,
                ...props,
                ...children.props,
                "data-state": popoverState,
            }),
        );
    }

    return (
        <button
            ref={ref}
            type="button"
            data-state={popoverState}
            {...context.getReferenceProps(props)}
        >
            {children}
        </button>
    );
});

export const PopoverContent = forwardRef(({ style, ...props }, refToMe) => {
    const {
        context: floatingContext,
        popoverOutline,
        ...context
    } = usePopoverContext();
    const ref = useMergeRefs([context.refs.setFloating, refToMe]);

    if (!floatingContext.open) {return null;}

    const popoverStyles = (
        popoverOutline
        ? {
            outlineColor: popoverOutline,
            outlineStyle: 'solid',
            outlineWidth: '1px',
        }
        : {}
    );
    return (
        <FloatingPortal>
            <FloatingFocusManager context={floatingContext} modal={context.modal}>
                <div
                    ref={ref}
                    style={{
                        ...context.floatingStyles,
                        ...popoverStyles,
                        ...style
                    }}
                    aria-labelledby={context.labelId}
                    aria-describedby={context.descriptionId}
                    {...context.getFloatingProps(props)}
                >
                    {props.children}
                    {context.popoverArrow}
                </div>
            </FloatingFocusManager>
        </FloatingPortal>
    );
});

export const PopoverTitle = forwardRef(({renderAs, children, ...props}, refToMe) => {
    const { setLabelId } = usePopoverContext();
    const id = useId();

    useLayoutEffect(() => {
        setLabelId(id);
        return () => setLabelId(undefined);
    }, [id, setLabelId]);

    return React.createElement(
        renderAs ?? 'h2',
        {...props, ref: refToMe, id},
        ...React.Children.toArray(children)
    );
});

export const PopoverDescription = forwardRef(({renderAs, children, ...props}, refToMe) => {
    const { setDescriptionId } = usePopoverContext();
    const id = useId();

    useLayoutEffect(() => {
        setDescriptionId(id);
        return () => setDescriptionId(id);
    }, [id, setDescriptionId]);

    return React.createElement(
        renderAs ?? 'p',
        {...props, ref: refToMe, id},
        ...React.Children.toArray(children)
    );
});

export const makePopoverCloser = () => {
    const { setOpen } = usePopoverContext();
    return () => { setOpen(false); };
};
const addChainer = (firstHandler) => {
    firstHandler.andThen = (secondHandler) => addChainer((event) => {
        firstHandler(event);
        secondHandler(event);
    });
    return firstHandler;
};

Object.defineProperties(Popover, {
    Trigger:        { value: PopoverTrigger,        enumerable: true },
    Content:        { value: PopoverContent,        enumerable: true },
    Title:          { value: PopoverTitle,          enumerable: true },
    Description:    { value: PopoverDescription,    enumerable: true },
    close:          { get: () => addChainer(makePopoverCloser()), enumerable: true },
});
