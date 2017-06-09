import * as Actions from '../index';
import moxios from 'moxios';
import moment from 'moment-timezone';
import {isPromise, moxiosWait, moxiosRespond} from '../../test-utils';

jest.mock('../../utilities/apiUtils', () => ({
  transformApiToInternalItem: jest.fn(response => ({...response, transformedToInternal: true})),
  transformInternalToApiItem: jest.fn(internal => ({...internal, transformedToApi: true})),
}));

const getBasicState = () => ({
  courses: [],
  timeZone: 'UTC',
  days: [
    ['2017-05-22', [{id: '42', dateBucketMoment: moment.tz('2017-05-22', 'UTC')}]],
    ['2017-05-24', [{id: '42', dateBucketMoment: moment.tz('2017-05-24', 'UTC')}]],
  ],
  loading: {
    futureNextUrl: null,
    pastNextUrl: null,
  },
});

describe('api actions', () => {
  beforeEach(() => {
    moxios.install();
    expect.hasAssertions();
  });

  afterEach(() => {
    moxios.uninstall();
  });

  describe('getPlannerItems', () => {
    it('dispatches startLoadingItems and getNewActivity initially', () => {
      const fakeDispatch = jest.fn();
      Actions.getPlannerItems(moment())(fakeDispatch, getBasicState);
      expect(fakeDispatch).toHaveBeenCalledWith(expect.objectContaining({
        type: 'START_LOADING_ITEMS'
      }));

      // also dispatches getNewActivity thunk
      expect(typeof fakeDispatch.mock.calls[1][0]).toBe('function');
      const getNewActivityThunk = fakeDispatch.mock.calls[1][0];
      const mockMoment = moment();
      const newActivityPromise = getNewActivityThunk(fakeDispatch, getBasicState);
      return moxiosRespond([{dateBucketMoment: mockMoment}], newActivityPromise).then((result) => {
        expect(fakeDispatch).toHaveBeenCalledWith(expect.objectContaining({
          type: 'FOUND_FIRST_NEW_ACTIVITY_DATE',
        }));
      });
    });

    it('dispatches GOT_ITEMS_SUCCESS after items are loaded', () => {
      const fakeDispatch = jest.fn();
      const loadingPromise = Actions.getPlannerItems(moment())(fakeDispatch, getBasicState);
      return moxiosRespond([{some: 'data'}], loadingPromise).then((result) => {
        const callParams = fakeDispatch.mock.calls[2][0];
        expect(callParams).toMatchObject({
          type: 'GOT_ITEMS_SUCCESS',
          payload: {
            internalItems: [{some: 'data', transformedToInternal: true}],
          },
        });
        expect(callParams.payload).toHaveProperty('response');
      });
    });

    it('dispatches all items loaded if no items loaded', () => {
      const fakeDispatch = jest.fn();
      const loadingPromise = Actions.getPlannerItems(moment())(fakeDispatch, getBasicState);
      return moxiosRespond([], loadingPromise).then((result) => {
        expect(fakeDispatch).toHaveBeenCalledWith({type: 'ALL_FUTURE_ITEMS_LOADED'});
        expect(fakeDispatch).toHaveBeenCalledWith({type: 'ALL_PAST_ITEMS_LOADED'});
      });
    });

  });

  describe('getNewActivity', () => {
    it('sends deep past and filter parameters', () => {
      const mockDispatch = jest.fn();
      const mockMoment = moment.tz('Asia/Tokyo').startOf('day');
      Actions.getNewActivity(mockMoment)(mockDispatch, getBasicState);
      return moxiosWait(request => {
        expect(request.config.params.filter).toBe('new_activity');
        expect(request.config.params.due_after).toBe(mockMoment.subtract(6, 'months').format());
      });
    });

  });

  describe('savePlannerItem', () => {
    it('dispatches saving and saved actions', () => {
      const mockDispatch = jest.fn();
      const plannerItem = {some: 'data'};
      const savePromise = Actions.savePlannerItem(plannerItem)(mockDispatch, getBasicState);
      expect(isPromise(savePromise)).toBe(true);
      expect(mockDispatch).toHaveBeenCalledWith({type: 'SAVING_PLANNER_ITEM', payload: plannerItem});
      expect(mockDispatch).toHaveBeenCalledWith({type: 'SAVED_PLANNER_ITEM', payload: savePromise});
    });

    it ('sends transformed data in the request', () => {
      const mockDispatch = jest.fn();
      const plannerItem = {some: 'data'};
      Actions.savePlannerItem(plannerItem)(mockDispatch, getBasicState);
      return moxiosWait(request => {
        expect(JSON.parse(request.config.data)).toMatchObject({some: 'data', transformedToApi: true});
      });
    });

    it ('resolves the promise with transformed response data', () => {
      const mockDispatch = jest.fn();
      const plannerItem = {some: 'data'};
      const savePromise = Actions.savePlannerItem(plannerItem)(mockDispatch, getBasicState);
      return moxiosRespond(
        { some: 'response data' },
        savePromise
      ).then((result) => {
        expect(result).toMatchObject({
          some: 'response data', transformedToInternal: true,
        });
      });
    });

    it('does a post if the planner item is new (no id)', () => {
      const plannerItem = {some: 'data'};
      Actions.savePlannerItem(plannerItem)(() => {});
      return moxiosWait((request) => {
        expect(request.config.method).toBe('post');
        expect(request.url).toBe('api/v1/planner/items');
        expect(JSON.parse(request.config.data)).toMatchObject({some: 'data', transformedToApi: true});
      });
    });

    it('does a put if the planner item exists (has id)', () => {
      const plannerItem = {id: '42', some: 'data'};
      Actions.savePlannerItem(plannerItem, )(() => {});
      return moxiosWait((request) => {
        expect(request.config.method).toBe('put');
        expect(request.url).toBe('api/v1/planner/items/42');
        expect(JSON.parse(request.config.data)).toMatchObject({id: '42', some: 'data', transformedToApi: true});
      });
    });
  });

  describe('deletePlannerItem', () => {
    it('dispatches deleting and deleted actions', () => {
      const mockDispatch = jest.fn();
      const plannerItem = {some: 'data'};
      const deletePromise = Actions.deletePlannerItem(plannerItem)(mockDispatch, getBasicState);
      expect(isPromise(deletePromise)).toBe(true);
      expect(mockDispatch).toHaveBeenCalledWith({type: 'DELETING_PLANNER_ITEM', payload: plannerItem});
      expect(mockDispatch).toHaveBeenCalledWith({type: 'DELETED_PLANNER_ITEM', payload: deletePromise});
    });

    it('sends a delete request for the item id', () => {
      const plannerItem = {id: '42', some: 'data'};
      Actions.deletePlannerItem(plannerItem, )(() => {});
      return moxiosWait((request) => {
        expect(request.config.method).toBe('delete');
        expect(request.url).toBe('api/v1/planner/items/42');
      });
    });

    it('resolves the promise with transformed response data', () => {
      const mockDispatch = jest.fn();
      const plannerItem = {some: 'data'};
      const deletePromise = Actions.deletePlannerItem(plannerItem)(mockDispatch, getBasicState);
      return moxiosRespond(
        { some: 'response data' },
        deletePromise
      ).then((result) => {
        expect(result).toMatchObject({some: 'response data', transformedToInternal: true});
      });
    });
  });

  describe('loadFutureItems', () => {
    it('dispatches loading actions', () => {
      const mockDispatch = jest.fn();
      const fetchPromise = Actions.loadFutureItems()(mockDispatch, getBasicState);
      expect(isPromise(fetchPromise));
      expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({type: 'GETTING_FUTURE_ITEMS'}));
      // GOT_ITEMS_SUCCESS is dispatched by the action when internal promise is fulfulled
    });

    it('sends the due_after parameter as one day after the last day if no futureNextUrl', () => {
      const mockDispatch = jest.fn();
      const numDays = getBasicState().days.length;
      const afterMoment = getBasicState().days[numDays-1][1][0].dateBucketMoment
        .clone().add(1, 'days');
      Actions.loadFutureItems()(mockDispatch, getBasicState);
      return moxiosWait((request) => {
        expect(moment(request.config.params.due_after).isSame(afterMoment)).toBeTruthy();
      });
    });

    it('sends the next url if there is a futureNextUrl', () => {
      const mockDispatch = jest.fn();
      const modifiedState = getBasicState();
      modifiedState.loading.futureNextUrl = 'some next url';
      Actions.loadFutureItems()(mockDispatch, () => modifiedState);
      return moxiosWait((request) => {
        expect(request.url).toBe('some next url');
      });
    });

    it('resolves the promise with transformed response data', () => {
      const mockDispatch = jest.fn();
      const fetchPromise = Actions.loadFutureItems()(mockDispatch, getBasicState);
      return moxiosRespond([{some: 'response'}], fetchPromise).then(result => {
        expect(result).toMatchObject([{some: 'response', transformedToInternal: true}]);
        const gotItemsParams = mockDispatch.mock.calls[1][0];
        expect(gotItemsParams).toMatchObject({
          type: 'GOT_ITEMS_SUCCESS',
          payload: {
            internalItems: [{some: 'response', transformedToInternal: true}],
          },
        });
        expect(gotItemsParams.payload).toHaveProperty('response');
      });
    });

    it('dispatches all future items loaded if no items loaded and there is no next link', () => {
      const mockDispatch = jest.fn();
      const fetchPromise = Actions.loadFutureItems()(mockDispatch, getBasicState);
      return moxiosRespond([], fetchPromise).then(result => {
        expect(mockDispatch).toHaveBeenCalledWith({type: 'ALL_FUTURE_ITEMS_LOADED'});
      });
    });

    it('does not dispatch all future items loaded if no items loaded and there is a next link', () => {
      const mockDispatch = jest.fn();
      const fetchPromise = Actions.loadFutureItems()(mockDispatch, getBasicState);
      return moxiosRespond([], fetchPromise, {headers: {link: '<futureNextUrl>; rel="next"'}}).then(result => {
        expect(mockDispatch).not.toHaveBeenCalledWith({type: 'ALL_FUTURE_ITEMS_LOADED'});
      });
    });
  });

  describe('scrollIntoPast', () => {
    it('dispatches scrolling and got items actions', () => {
      const mockDispatch = jest.fn();
      const scrollPromise = Actions.scrollIntoPast()(mockDispatch, getBasicState);
      expect(isPromise(scrollPromise));
      expect(mockDispatch).toHaveBeenCalledWith({type: 'GETTING_PAST_ITEMS'});
      return moxiosRespond([{some: 'response'}], scrollPromise).then((result) => {
        const gotItemsParams = mockDispatch.mock.calls[1][0];
        expect(gotItemsParams).toMatchObject({
          type: 'GOT_ITEMS_SUCCESS',
          payload: {
            internalItems: [{some: 'response', transformedToInternal: true}],
          },
        });
        expect(gotItemsParams.payload).toHaveProperty('response');
      });
    });

    it('sends due_before parameter as the first loaded day', () => {
      const mockDispatch = jest.fn();
      const beforeMoment = getBasicState().days[0][1][0].dateBucketMoment;
      Actions.scrollIntoPast()(mockDispatch, getBasicState);
      return moxiosWait((request) => {
        expect(moment(request.config.params.due_before).isSame(beforeMoment)).toBeTruthy();
      });
    });

    it('sends the pastNextUrl if there is one', () => {
      const mockDispatch = jest.fn();
      const modifiedState = getBasicState();
      modifiedState.loading.pastNextUrl = 'some past url';
      Actions.scrollIntoPast()(mockDispatch, () => modifiedState);
      return moxiosWait((request) => {
        expect(request.url).toBe('some past url');
      });
    });

    it('dispatches all past items loaded if nothing was loaded and there is no next link', () => {
      const mockDispatch = jest.fn();
      const fetchPromise = Actions.scrollIntoPast()(mockDispatch, getBasicState);
      return moxiosRespond([], fetchPromise).then(result => {
        expect(mockDispatch).toHaveBeenCalledWith({type: 'ALL_PAST_ITEMS_LOADED'});
      });
    });

    it('does not dispatch all past items loaded if there is a next link', () => {
      const mockDispatch = jest.fn();
      const fetchPromise = Actions.scrollIntoPast()(mockDispatch, getBasicState);
      return moxiosRespond([], fetchPromise, {headers: {link: '<futureNextUrl>; rel="next"'}}).then(result => {
        expect(mockDispatch).not.toHaveBeenCalledWith({type: 'ALL_PAST_ITEMS_LOADED'});
      });
    });
  });
});
