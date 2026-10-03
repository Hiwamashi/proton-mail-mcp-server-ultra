# conversation-threads Specification

## Purpose
Lets an agent see the whole conversation around a message – what it replies to and what replied to it, in every folder – so it can answer with full context.

## Requirements

### Requirement: Get thread
`get_thread` SHALL take `uid` and `folder` (default `INBOX`) of one message and return all messages of its conversation found in "All Mail": messages whose Message-ID appears in the start message's `References` or `In-Reply-To`, and messages whose `References` or `In-Reply-To` contain the Message-ID of any message already found, repeated until no new message is found or 100 messages are reached. Messages SHALL be returned oldest first as message summaries with their UID in "All Mail", the folders they are in (if determinable), `messageId` and `inReplyTo`. The result SHALL mark the start message.

#### Scenario: Reply chain
- **WHEN** `get_thread` is called for the third message of a chain A → B → C
- **THEN** A, B and C are returned in that order and C is marked as the start message

#### Scenario: Own replies in Sent
- **WHEN** the user's replies are stored in Sent and the start message is in INBOX
- **THEN** the user's replies are part of the thread

#### Scenario: Message without threading headers
- **WHEN** the start message has no References and nobody replied to it
- **THEN** the thread contains only that message

#### Scenario: Large thread
- **WHEN** a conversation has more than 100 messages
- **THEN** 100 messages are returned and the result says the thread was truncated

### Requirement: Thread bodies within a budget
With `includeBodies` (default true), `get_thread` SHALL include each message's readable body with quoted history removed. The bodies together SHALL NOT exceed `maxChars` (500–100000, default 20000); when the budget is exceeded the oldest bodies SHALL be shortened or omitted first, and the result SHALL say which messages were shortened. With `includeBodies: false` only summaries SHALL be returned.

#### Scenario: Long conversation
- **WHEN** a thread of 20 messages exceeds the budget
- **THEN** the newest messages have full bodies, older ones are shortened or omitted, and this is stated in the result

### Requirement: Thread without side effects
`get_thread` SHALL NOT change flags of any message.

#### Scenario: Unread replies
- **WHEN** a thread contains unread messages
- **THEN** they stay unread after `get_thread`
