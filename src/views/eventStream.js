/**
 * @description
 * This module provides tools for passing events in Preact props.
 */

import _ from 'lodash';

const TIME_STAMP = Symbol('timestamp');

export const newEvent = (props) => ({
    ...props,
    [TIME_STAMP]: Date.now()
});

/**
 * 
 * @param  {...any} events
 *      Events created by `newEvent` in any time order
 * @returns
 *      Unified projection of all events, with newest parts obscuring any
 *      conflicting older parts
 */
export const projectEventStream = (...events) => (
    _(events)
    .filter(e => e?.[TIME_STAMP])
    .sortBy(e => e[TIME_STAMP])
    .thru(events => _.tap(
        _.merge({}, ...events),
        unified => {
            unified[TIME_STAMP] = _.last(events)?.[TIME_STAMP];
        }
    ))
    .value()
);

export const eventTime = (event) => event?.[TIME_STAMP];
