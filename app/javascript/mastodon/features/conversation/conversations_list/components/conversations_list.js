import React from 'react';
import PropTypes from 'prop-types';
import ImmutablePropTypes from 'react-immutable-proptypes';
import ImmutablePureComponent from 'react-immutable-pure-component';
import { debounce } from 'lodash';
import ConversationContainer from '../containers/conversation_container';
import ScrollableList from '../../../../components/scrollable_list';

export default class ConversationsList extends ImmutablePureComponent {

  static propTypes = {
    conversations: ImmutablePropTypes.list.isRequired,
    scrollKey: PropTypes.string.isRequired,
    hasMore: PropTypes.bool,
    isLoading: PropTypes.bool,
    onLoadMore: PropTypes.func,
    shouldUpdateScroll: PropTypes.func,
  };

  getCurrentIndex = id => this.props.conversations.findIndex(x => x.get('id') === id)

  handleMoveUp = id => {
    const elementIndex = this.getCurrentIndex(id) - 1;
    this._selectChild(elementIndex, true);
  }

  handleMoveDown = id => {
    const elementIndex = this.getCurrentIndex(id) + 1;
    this._selectChild(elementIndex, false);
  }

  _selectChild(index, align_top) {
    const container = this.node.node;
    const element = container.querySelector(`article:nth-of-type(${index + 1}) .focusable`);

    if (element) {
      if (align_top && container.scrollTop > element.offsetTop) {
        element.scrollIntoView(true);
      } else if (!align_top && container.scrollTop + container.clientHeight < element.offsetTop + element.offsetHeight) {
        element.scrollIntoView(false);
      }
      element.focus();
    }
  }

  setRef = c => {
    this.node = c;
  }

  handleLoadOlder = debounce(() => {
    const last = this.props.conversations.last();

    if (last && last.get('last_status')) {
      this.props.onLoadMore(last.get('last_status'));
    }
  }, 300, { leading: true })

  render() {
    const { conversations, onLoadMore, ...other } = this.props;

    const conversationsArray = JSON.parse(JSON.stringify(conversations))
    const conversationsObj = {}
    for (let conv of conversationsArray) {
      if (!conversationsObj[conv.accounts[0]]) {
        conversationsObj[conv.accounts[0]] = { ...conv, threads: [conv.last_status] }
      }
      else {
        conversationsObj[conv.accounts[0]].threads.push(conv.last_status)
      }
    }
    const conversationsArrayByUser = Object.values(conversationsObj)

    return (
      <ScrollableList {...other} onLoadMore={onLoadMore && this.handleLoadOlder} ref={this.setRef}>
        {conversationsArrayByUser.map(item => (
          <ConversationContainer
            key={item.id}
            conversationId={item.id}
            conversation={item}
            onMoveUp={this.handleMoveUp}
            onMoveDown={this.handleMoveDown}
            scrollKey={this.props.scrollKey}
          />
        ))}
      </ScrollableList>
    );
  }

}