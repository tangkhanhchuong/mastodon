import { ScrollContainer } from 'react-router-scroll-4';
import React from 'react';
import { connect } from 'react-redux';
import { defineMessages, injectIntl, FormattedMessage } from 'react-intl';
import ImmutablePureComponent from 'react-immutable-pure-component';
import { HotKeys } from 'react-hotkeys';
import ImmutablePropTypes from 'react-immutable-proptypes';
import Immutable from 'immutable';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import { createSelector } from 'reselect';
import { fetchStatus } from '../../../actions/statuses';
import MissingIndicator from '../../../components/missing_indicator';
import DetailedStatus from './components/detailed_status';
import Column from '../../ui/components/column';
import { mountConversations, expandConversations } from '../../../actions/conversations';
import {
  favourite,
  unfavourite,
  bookmark,
  unbookmark,
  reblog,
  unreblog,
  pin,
  unpin,
} from '../../../actions/interactions';
import {
  replyCompose,
  mentionCompose,
  directCompose,
} from '../../../actions/compose';
import {
  muteStatus,
  unmuteStatus,
  deleteStatus,
  hideStatus,
  revealStatus,
} from '../../../actions/statuses';
import {
  unblockAccount,
  unmuteAccount,
} from '../../../actions/accounts';
import {
  blockDomain,
  unblockDomain,
} from '../../../actions/domain_blocks';
import { initMuteModal } from '../../../actions/mutes';
import { initBlockModal } from '../../../actions/blocks';
import { initBoostModal } from '../../../actions/boosts';
import { initReport } from '../../../actions/reports';
import { makeGetStatus, makeGetPictureInPicture } from '../../../selectors';
import ColumnBackButton from '../../../components/column_back_button';
import StatusContainer from './containers/status_container';
import { openModal } from '../../../actions/modal';
import { boostModal, deleteModal, me } from '../../../initial_state';
import { attachFullscreenListener, detachFullscreenListener, isFullscreen } from '../../ui/util/fullscreen';
import { textForScreenReader, defaultMediaVisibility } from '../../../components/status';
import ColumnHeader from './components/column_header';
import ActionBar from './components/action_bar';

const THREADS_IDS = ['107573073420646722', '107573068830442733']

const messages = defineMessages({
  deleteConfirm: { id: 'confirmations.delete.confirm', defaultMessage: 'Delete' },
  deleteMessage: { id: 'confirmations.delete.message', defaultMessage: 'Are you sure you want to delete this status?' },
  redraftConfirm: { id: 'confirmations.redraft.confirm', defaultMessage: 'Delete & redraft' },
  redraftMessage: { id: 'confirmations.redraft.message', defaultMessage: 'Are you sure you want to delete this status and re-draft it? Favourites and boosts will be lost, and replies to the original post will be orphaned.' },
  revealAll: { id: 'status.show_more_all', defaultMessage: 'Show more for all' },
  hideAll: { id: 'status.show_less_all', defaultMessage: 'Show less for all' },
  detailedStatus: { id: 'status.detailed_status', defaultMessage: 'Detailed conversation view' },
  replyConfirm: { id: 'confirmations.reply.confirm', defaultMessage: 'Reply' },
  replyMessage: { id: 'confirmations.reply.message', defaultMessage: 'Replying now will overwrite the message you are currently composing. Are you sure you want to proceed?' },
  blockDomainConfirm: { id: 'confirmations.domain_block.confirm', defaultMessage: 'Hide entire domain' },
  showReplies: { id: 'confirmations.show_replies', defaultMessage: 'Show Replies' },
  hideReplies: { id: 'confirmations.hide_replies', defaultMessage: 'Hide Replies' }
});

const makeMapStateToProps = () => {
  const getStatus = makeGetStatus();
  const getPictureInPicture = makeGetPictureInPicture();

  const getAncestorsIds = createSelector([
    (_, { id }) => id,
    state => state.getIn(['contexts', 'inReplyTos']),
  ], (statusId, inReplyTos) => {
    let ancestorsIds = Immutable.List();
    ancestorsIds = ancestorsIds.withMutations(mutable => {
      let id = statusId;

      while (id) {
        mutable.unshift(id);
        id = inReplyTos.get(id);
      }
    });

    return ancestorsIds;
  });

  const getDescendantsIds = createSelector([
    (_, { id }) => id,
    state => state.getIn(['contexts', 'replies']),
    state => state.get('statuses'),
  ], (statusId, contextReplies, statuses) => {
    let descendantsIds = [];
    const ids = [statusId];

    while (ids.length > 0) {
      let id = ids.shift();
      const replies = contextReplies.get(id);

      if (statusId !== id) {
        descendantsIds.push(id);
      }

      if (replies) {
        replies.reverse().forEach(reply => {
          ids.unshift(reply);
        });
      }
    }

    let insertAt = descendantsIds.findIndex((id) => statuses.get(id).get('in_reply_to_account_id') !== statuses.get(id).get('account'));
    if (insertAt !== -1) {
      descendantsIds.forEach((id, idx) => {
        if (idx > insertAt && statuses.get(id).get('in_reply_to_account_id') === statuses.get(id).get('account')) {
          descendantsIds.splice(idx, 1);
          descendantsIds.splice(insertAt, 0, id);
          insertAt += 1;
        }
      });
    }

    return Immutable.List(descendantsIds);
  });

  const mapStateToProps = (state, props) => {
    const status = getStatus(state, { id: props.params.statusId });

    const accountId = props.params.statusId
    const conversations = JSON.parse(JSON.stringify(state)).conversations.items;

    const conversationsArray = JSON.parse(JSON.stringify(conversations));
    const conversationsObj = {};
    for (let conv of conversationsArray) {
      if (!conversationsObj[conv.accounts[0]]) {
        conversationsObj[conv.accounts[0]] = { ...conv, threads: [conv.last_status] };
      }
      else {
        conversationsObj[conv.accounts[0]].threads.push(conv.last_status);
      }
    }
    const currentConversation = conversationsObj[accountId];

    let ancestorsIds = Immutable.List();
    let descendantsIds = Immutable.List();

    if (status) {
      ancestorsIds = getAncestorsIds(state, { id: status.get('in_reply_to_id') });
      descendantsIds = getDescendantsIds(state, { id: status.get('id') });
    }

    let threads = [];
    if (currentConversation) {
      for (let threadId of currentConversation.threads) {
        const thread = getStatus(state, { id: threadId });
        let threadAncestorsIds = Immutable.List();
        let threadDescendantsIds = Immutable.List();

        if (thread) {
          threadAncestorsIds = getAncestorsIds(state, { id: thread.get('in_reply_to_id') });

          let firstStatus = thread;
          if (threadAncestorsIds.size !== 0) {
            const firstStatusId = threadAncestorsIds.get(0)
            firstStatus = getStatus(state, { id: firstStatusId });
          }

          if (firstStatus) {
            threadDescendantsIds = getDescendantsIds(state, { id: firstStatus.get('id') });
            threadDescendantsIds = threadDescendantsIds.sort((a, b) => a - b)
            threads.push({ thread: firstStatus, threadDescendantsIds });
          }
        }
      }
    }

    threads.sort((a, b) => a.thread.get('id') - b.thread.get('id'))

    return {
      account: state.getIn(['accounts', accountId]),
      threads,
      status,
      ancestorsIds,
      descendantsIds,
      askReplyConfirmation: state.getIn(['compose', 'text']).trim().length !== 0,
      domain: state.getIn(['meta', 'domain']),
      pictureInPicture: getPictureInPicture(state, { id: props.params.statusId }),
    };
  };

  return mapStateToProps;
};

class Status extends ImmutablePureComponent {

  static contextTypes = {
    router: PropTypes.object,
  };

  static propTypes = {
    params: PropTypes.object.isRequired,
    dispatch: PropTypes.func.isRequired,
    status: ImmutablePropTypes.map,
    ancestorsIds: ImmutablePropTypes.list,
    descendantsIds: ImmutablePropTypes.list,
    intl: PropTypes.object.isRequired,
    askReplyConfirmation: PropTypes.bool,
    multiColumn: PropTypes.bool,
    domain: PropTypes.string.isRequired,
    pictureInPicture: ImmutablePropTypes.contains({
      inUse: PropTypes.bool,
      available: PropTypes.bool,
    }),
    threads: PropTypes.array
  };

  state = {
    fullscreen: false,
    showMedia: defaultMediaVisibility(this.props.status),
    loadedStatusId: undefined,
    showRepliesThreads: []
  };

  componentWillMount() {
    const { dispatch, threads } = this.props;

    dispatch(mountConversations());
    dispatch(expandConversations());

    if (threads) {
      for (let thread of threads) {
        dispatch(fetchStatus(thread.thread.get('id')));
      }
    }
  }

  componentDidMount() {
    attachFullscreenListener(this.onFullScreenChange);
    console.log('did mount')
  }

  componentDidUpdate(prevProps, prevState) {
    if (this._scrolledIntoView) {
      return;
    }

    const { status, ancestorsIds, threads } = this.props;

    if (status && ancestorsIds && ancestorsIds.size > 0) {
      const element = this.node.querySelectorAll('.focusable')[ancestorsIds.size - 1];

      window.requestAnimationFrame(() => {
        element.scrollIntoView(true);
      });
      this._scrolledIntoView = true;
    }

    if (threads && threads.length !== prevProps.threads.length) {
      for (let thread of threads) {
        this.props.dispatch(fetchStatus(thread.thread.get('id')));
      }
    }
  }

  componentWillUnmount() {
    detachFullscreenListener(this.onFullScreenChange);
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.params.statusId !== this.props.params.statusId && nextProps.params.statusId) {
      this._scrolledIntoView = false;
      this.props.dispatch(fetchStatus(nextProps.params.statusId));
    }

    if (nextProps.status && nextProps.status.get('id') !== this.state.loadedStatusId) {
      console.log('will receive props3')
      this.setState({ showMedia: defaultMediaVisibility(nextProps.status), loadedStatusId: nextProps.status.get('id') });
    }
  }

  handleToggleMediaVisibility = () => {
    this.setState({ showMedia: !this.state.showMedia });
  }

  handleFavouriteClick = (status) => {
    if (status.get('favourited')) {
      this.props.dispatch(unfavourite(status));
    } else {
      this.props.dispatch(favourite(status));
    }
  }

  handlePin = (status) => {
    if (status.get('pinned')) {
      this.props.dispatch(unpin(status));
    } else {
      this.props.dispatch(pin(status));
    }
  }

  handleReplyClick = (status) => {
    let { askReplyConfirmation, dispatch, intl } = this.props;
    if (askReplyConfirmation) {
      dispatch(openModal('CONFIRM', {
        message: intl.formatMessage(messages.replyMessage),
        confirm: intl.formatMessage(messages.replyConfirm),
        onConfirm: () => dispatch(replyCompose(status, this.context.router.history)),
      }));
    } else {
      dispatch(replyCompose(status, this.context.router.history));
    }
  }

  handleModalReblog = (status, privacy) => {
    this.props.dispatch(reblog(status, privacy));
  }

  handleReblogClick = (status, e) => {
    if (status.get('reblogged')) {
      this.props.dispatch(unreblog(status));
    } else {
      if ((e && e.shiftKey) || !boostModal) {
        this.handleModalReblog(status);
      } else {
        this.props.dispatch(initBoostModal({ status, onReblog: this.handleModalReblog }));
      }
    }
  }

  handleBookmarkClick = (status) => {
    if (status.get('bookmarked')) {
      this.props.dispatch(unbookmark(status));
    } else {
      this.props.dispatch(bookmark(status));
    }
  }

  handleDeleteClick = (status, history, withRedraft = false) => {
    const { dispatch, intl } = this.props;

    if (!deleteModal) {
      dispatch(deleteStatus(status.get('id'), history, withRedraft));
    } else {
      dispatch(openModal('CONFIRM', {
        message: intl.formatMessage(withRedraft ? messages.redraftMessage : messages.deleteMessage),
        confirm: intl.formatMessage(withRedraft ? messages.redraftConfirm : messages.deleteConfirm),
        onConfirm: () => dispatch(deleteStatus(status.get('id'), history, withRedraft)),
      }));
    }
  }

  handleDirectClick = (account, router) => {
    this.props.dispatch(directCompose(account, router));
  }

  handleMentionClick = (account, router) => {
    this.props.dispatch(mentionCompose(account, router));
  }

  handleOpenMedia = (media, index) => {
    this.props.dispatch(openModal('MEDIA', { statusId: this.props.status.get('id'), media, index }));
  }

  handleOpenVideo = (media, options) => {
    this.props.dispatch(openModal('VIDEO', { statusId: this.props.status.get('id'), media, options }));
  }

  handleHotkeyOpenMedia = e => {
    const { status } = this.props;

    e.preventDefault();

    if (status.get('media_attachments').size > 0) {
      if (status.getIn(['media_attachments', 0, 'type']) === 'video') {
        this.handleOpenVideo(status.getIn(['media_attachments', 0]), { startTime: 0 });
      } else {
        this.handleOpenMedia(status.get('media_attachments'), 0);
      }
    }
  }

  handleMuteClick = (account) => {
    this.props.dispatch(initMuteModal(account));
  }

  handleConversationMuteClick = (status) => {
    if (status.get('muted')) {
      this.props.dispatch(unmuteStatus(status.get('id')));
    } else {
      this.props.dispatch(muteStatus(status.get('id')));
    }
  }

  handleToggleHidden = (status) => {
    if (status.get('hidden')) {
      this.props.dispatch(revealStatus(status.get('id')));
    } else {
      this.props.dispatch(hideStatus(status.get('id')));
    }
  }

  handleToggleAll = () => {
    const { status, ancestorsIds, descendantsIds } = this.props;
    const statusIds = [status.get('id')].concat(ancestorsIds.toJS(), descendantsIds.toJS());

    if (status.get('hidden')) {
      this.props.dispatch(revealStatus(statusIds));
    } else {
      this.props.dispatch(hideStatus(statusIds));
    }
  }

  handleBlockClick = (status) => {
    const { dispatch } = this.props;
    const account = status.get('account');
    dispatch(initBlockModal(account));
  }

  handleReport = (status) => {
    this.props.dispatch(initReport(status.get('account'), status));
  }

  handleEmbed = (status) => {
    this.props.dispatch(openModal('EMBED', { url: status.get('url') }));
  }

  handleUnmuteClick = account => {
    this.props.dispatch(unmuteAccount(account.get('id')));
  }

  handleUnblockClick = account => {
    this.props.dispatch(unblockAccount(account.get('id')));
  }

  handleBlockDomainClick = domain => {
    this.props.dispatch(openModal('CONFIRM', {
      message: <FormattedMessage id='confirmations.domain_block.message' defaultMessage='Are you really, really sure you want to block the entire {domain}? In most cases a few targeted blocks or mutes are sufficient and preferable. You will not see content from that domain in any public timelines or your notifications. Your followers from that domain will be removed.' values={{ domain: <strong>{domain}</strong> }} />,
      confirm: this.props.intl.formatMessage(messages.blockDomainConfirm),
      onConfirm: () => this.props.dispatch(blockDomain(domain)),
    }));
  }

  handleUnblockDomainClick = domain => {
    this.props.dispatch(unblockDomain(domain));
  }


  handleHotkeyMoveUp = () => {
    this.handleMoveUp(this.props.status.get('id'));
  }

  handleHotkeyMoveDown = () => {
    this.handleMoveDown(this.props.status.get('id'));
  }

  handleHotkeyReply = e => {
    e.preventDefault();
    this.handleReplyClick(this.props.status);
  }

  handleHotkeyFavourite = () => {
    this.handleFavouriteClick(this.props.status);
  }

  handleHotkeyBoost = () => {
    this.handleReblogClick(this.props.status);
  }

  handleHotkeyMention = e => {
    e.preventDefault();
    this.handleMentionClick(this.props.status.get('account'));
  }

  handleHotkeyOpenProfile = () => {
    this.context.router.history.push(`/accounts/${this.props.status.getIn(['account', 'id'])}`);
  }

  handleHotkeyToggleHidden = () => {
    this.handleToggleHidden(this.props.status);
  }

  handleHotkeyToggleSensitive = () => {
    this.handleToggleMediaVisibility();
  }

  handleMoveUp = id => {
    const { status, ancestorsIds, descendantsIds } = this.props;

    if (id === status.get('id')) {
      this._selectChild(ancestorsIds.size - 1, true);
    } else {
      let index = ancestorsIds.indexOf(id);

      if (index === -1) {
        index = descendantsIds.indexOf(id);
        this._selectChild(ancestorsIds.size + index, true);
      } else {
        this._selectChild(index - 1, true);
      }
    }
  }

  handleMoveDown = id => {
    const { status, ancestorsIds, descendantsIds } = this.props;

    if (id === status.get('id')) {
      this._selectChild(ancestorsIds.size + 1, false);
    } else {
      let index = ancestorsIds.indexOf(id);

      if (index === -1) {
        index = descendantsIds.indexOf(id);
        this._selectChild(ancestorsIds.size + index + 2, false);
      } else {
        this._selectChild(index + 1, false);
      }
    }
  }

  hasReplies = (thread) => {
    const showRepliesThreads = this.state.showRepliesThreads;
    const threadId = thread.thread.get('id')
    return showRepliesThreads.includes(threadId)
  }

  showReplies = (thread) => {
    const showRepliesThreads = this.state.showRepliesThreads;
    const threadId = thread.thread.get('id')

    if (!this.hasReplies(thread)) this.setState({ showRepliesThreads: [...showRepliesThreads, threadId] })
    else {
      const filterShowRepliesThreads = showRepliesThreads.filter(t => t !== threadId)
      this.setState({ showRepliesThreads: filterShowRepliesThreads })
    }
  }

  _selectChild(index, align_top) {
    const container = this.node;
    const element = container.querySelectorAll('.focusable')[index];

    if (element) {
      if (align_top && container.scrollTop > element.offsetTop) {
        element.scrollIntoView(true);
      } else if (!align_top && container.scrollTop + container.clientHeight < element.offsetTop + element.offsetHeight) {
        element.scrollIntoView(false);
      }
      element.focus();
    }
  }

  renderChildren(list) {
    return list.map(id => (
      <StatusContainer
        key={id}
        id={id}
        onMoveUp={this.handleMoveUp}
        onMoveDown={this.handleMoveDown}
        contextType='thread'
      />
    ));
  }

  setRef = c => {
    this.node = c;
  }

  onFullScreenChange = () => {
    this.setState({ fullscreen: isFullscreen() });
  }

  render() {
    const { shouldUpdateScroll, status, ancestorsIds, descendantsIds, intl, domain, multiColumn, pictureInPicture, threads } = this.props;
    const { fullscreen } = this.state;

    if (threads === null || threads.length === 0) {
      return (
        <Column>
          <ColumnBackButton multiColumn={multiColumn} />
          <MissingIndicator />
        </Column>
      );
    }

    const otherUsername = this.props.account.get('acct');

    const handlers = {
      moveUp: this.handleHotkeyMoveUp,
      moveDown: this.handleHotkeyMoveDown,
      reply: this.handleHotkeyReply,
      favourite: this.handleHotkeyFavourite,
      boost: this.handleHotkeyBoost,
      mention: this.handleHotkeyMention,
      openProfile: this.handleHotkeyOpenProfile,
      toggleHidden: this.handleHotkeyToggleHidden,
      toggleSensitive: this.handleHotkeyToggleSensitive,
      openMedia: this.handleHotkeyOpenMedia,
    };

    return (
      <Column bindToDocument={!multiColumn} label={intl.formatMessage(messages.detailedStatus)}>
        <ColumnHeader
          showBackButton
          multiColumn={multiColumn}
          extraButton={(
            // <button className='column-header__button' title={intl.formatMessage(status.get('hidden') ? messages.revealAll : messages.hideAll)} aria-label={intl.formatMessage(status.get('hidden') ? messages.revealAll : messages.hideAll)} onClick={this.handleToggleAll} aria-pressed={status.get('hidden') ? 'false' : 'true'}><Icon id={status.get('hidden') ? 'eye-slash' : 'eye'} /></button>
            <button className='column-header__button'>{otherUsername}</button>
          )}
        />

        <ScrollContainer scrollKey='thread' shouldUpdateScroll={shouldUpdateScroll}>
          <div className={classNames('scrollable', { fullscreen })} ref={this.setRef}>
            {
              threads.map(thread => {
                let threadDescendants;
                if (thread.threadDescendantsIds && thread.threadDescendantsIds.size > 0) {
                  threadDescendants = <div>{this.renderChildren(thread.threadDescendantsIds)}</div>;
                }

                return (
                  <div key={thread.thread.get('id')}>
                    <HotKeys handlers={handlers}>
                      <div className={classNames('focusable', 'detailed-status__wrapper')} tabIndex='0' aria-label={textForScreenReader(intl, thread.thread, false)}>
                        <DetailedStatus
                          key={`details-${thread.thread.get('id')}`}
                          status={thread.thread}
                          onOpenVideo={this.handleOpenVideo}
                          onOpenMedia={this.handleOpenMedia}
                          onToggleHidden={this.handleToggleHidden}
                          domain={domain}
                          showMedia={this.state.showMedia}
                          onToggleMediaVisibility={this.handleToggleMediaVisibility}
                          pictureInPicture={pictureInPicture}
                        />
                        <ActionBar
                          key={`action-bar-${thread.thread.get('id')}`}
                          status={thread.thread}
                          onReply={this.handleReplyClick}
                          onFavourite={this.handleFavouriteClick}
                          onReblog={this.handleReblogClick}
                          onBookmark={this.handleBookmarkClick}
                          onDelete={this.handleDeleteClick}
                          onDirect={this.handleDirectClick}
                          onMention={this.handleMentionClick}
                          onMute={this.handleMuteClick}
                          onUnmute={this.handleUnmuteClick}
                          onMuteConversation={this.handleConversationMuteClick}
                          onBlock={this.handleBlockClick}
                          onUnblock={this.handleUnblockClick}
                          onBlockDomain={this.handleBlockDomainClick}
                          onUnblockDomain={this.handleUnblockDomainClick}
                          onReport={this.handleReport}
                          onPin={this.handlePin}
                          onEmbed={this.handleEmbed}
                          showReplies={this.showReplies.bind(this, thread)}
                        />
                      </div>
                    </HotKeys>

                    {this.hasReplies(thread) ? (
                      <>
                        {threadDescendants}
                      </>
                    ) : <></>}
                  </div>
                )
              })
            }
          </div>
        </ScrollContainer>
      </Column>
    );
  }

}


export default injectIntl(connect(makeMapStateToProps)(Status))