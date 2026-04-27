# Ropeybot (ver. 天上の狐)
> a node-based socket.io-client serving as a bot sdk for BC based on [FriendsOfBC/ropeybot](https://github.com/FriendsOfBC/ropeybot)

> [!NOTE]  
> with regards to licensing, please refer to the upstream original repository!  
> this branch acts as a **personal** de facto maintained version of the original `ropeybot`
> whilst the maintainers are inactive...

initially, this series of branches weren't intended to exist and
was just untracked uncommitted code on a local clone of the original repository
whilst hoping for the original maintainers to return, but after a month and
lots of changes, it was apparent that it wouldn't be happening any time soon,
so this was made in an attempt to track changes done whilst the maintainers are away,
and to have an easier time syncing in the future if need be...

if possible, it would have been ideal to continue just using the upstream repository
without many changes, but it's not really feasible long-term without active maintenance,
hence why this spinoff of `ropeybot` was created!

## Fork Structure
as said earlier, this fork serves as a maintained and tested version whilst
there are no updates being made to the upstream repository, you may use the code/branches as you wish,
whilst abiding by the original licensing rules, however, usage of it will not be
documented as this was meant to be a personal bot development kit, and also because
it wasn't meant to be distributed in the first place!

to begin with, `sdk/*` branches belong to this (ver. 天上の狐) spinoff,
whilst other branches are all intended for PRs to the original `ropeybot` repository...

### Stacked Branches

| Hierarchy | Branch Name | Purpose |
| :--- | :--- | :--- |
| **L1** | `sdk/main` | **Crucial Fixes:** Mirror of the original repo w/ essential bug & stability fixes |
| **L2** | `sdk/feat/upstream-new-features` | **New Features:** Features added to the original SDK version |
| **L3** | `sdk/upgrade/bc-dependency` | **BC Upgrade:** Moving BC dependency from original SDK version to the latest version |
| **L4** | `sdk/feat/upgraded-new-features` | **Modern Features:** New additions that rely on upgraded BC version |
| **L5** | `sdk/bot-collection/main` | **Active Work:** Final integration and actual bot collection development |

each subsequent branch is based on the previous in the hierarchy... i.e.
- **L1** is based off the original repo
- **L2** is based on **L1**
- **L3** is based on **L2**

### Propagation Workflow

1. checkout to **L5**
2. rebase on whichever base hierarchy, with `--update-refs`
3. on conflict, solve, stage, then rebase `--continue`
4. on disaster, rebase `--abort`

