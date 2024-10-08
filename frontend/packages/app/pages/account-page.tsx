import {Avatar} from '@mintter/app/components/avatar'
import Footer from '@mintter/app/components/footer'
import {OnlineIndicator} from '@mintter/app/components/indicator'
import {useAccountWithDevices} from '@mintter/app/models/contacts'
import {useNavRoute} from '@mintter/app/utils/navigation'
import {
  Event,
  HMAccount,
  HMDocument,
  HMPublication,
  Profile,
  PublicationContent,
  abbreviateCid,
  createHmId,
  getDocumentTitle,
  hmId,
  pluralS,
  pluralizer,
  unpackDocId,
  unpackHmId,
} from '@mintter/shared'
import {ListAccountGroupsResponse_Item} from '@mintter/shared/src/client/.generated/groups/v1alpha/groups_pb'
import {
  AlertDialog,
  BlockQuote,
  Button,
  ChevronDown,
  List,
  MenuItem,
  Popover,
  RadioButtons,
  Section,
  SizableText,
  Spinner,
  View,
  XStack,
  YGroup,
  YStack,
  copyTextToClipboard,
  toast,
} from '@mintter/ui'
import {PageContainer} from '@mintter/ui/src/container'
import {Trash} from '@tamagui/lucide-icons'
import React, {ReactNode, useMemo} from 'react'
import {VirtuosoHandle} from 'react-virtuoso'
import {AccessoryLayout} from '../components/accessory-sidebar'
import {AccountTrustButton} from '../components/account-trust'
import {EntityCitationsAccessory} from '../components/citations'
import {useCopyGatewayReference} from '../components/copy-gateway-reference'
import {useDeleteDialog} from '../components/delete-dialog'
import {FavoriteButton} from '../components/favoriting'
import {FooterButton} from '../components/footer'
import {GroupListItem} from '../components/groups-list'
import {ListItem, copyLinkMenuItem} from '../components/list-item'
import {MainWrapperNoScroll} from '../components/main-wrapper'
import {PublicationListItem} from '../components/publication-list-item'
import {CopyReferenceButton} from '../components/titlebar-common'
import {useAccount, useMyAccount} from '../models/accounts'
import {useEntityMentions} from '../models/content-graph'
import {
  useAccountPublicationFullList,
  useDraftList,
  usePublication,
} from '../models/documents'
import {useResourceFeedWithLatest} from '../models/feed'
import {useAccountGroups} from '../models/groups'
import {getAvatarUrl} from '../utils/account-url'
import {useNavigate} from '../utils/useNavigate'
import {FeedItem, FeedPageFooter, NewUpdatesButton} from './feed'
import {AppPublicationContentProvider} from './publication-content-provider'

function DeviceRow({
  isOnline,
  deviceId,
}: {
  isOnline: boolean
  deviceId: string
}) {
  return (
    <YGroup.Item>
      <ListItem
        onPress={() => {
          copyTextToClipboard(deviceId)
          toast.success('Copied Device ID to clipboard')
        }}
      >
        <OnlineIndicator online={isOnline} />
        {abbreviateCid(deviceId)}
      </ListItem>
    </YGroup.Item>
  )
}

export function getAccountName(profile: Profile | undefined) {
  if (!profile) return ''
  return profile.alias || 'Untitled Account'
}

export default function AccountPage() {
  const route = useNavRoute()
  const accountId = route.key === 'account' && route.accountId
  if (!accountId) throw new Error('Invalid route, no account id')
  const accessoryKey = route.accessory?.key
  const replace = useNavigate('replace')
  const accountEntityId = createHmId('a', accountId)
  const mentions = useEntityMentions(accountEntityId)
  const [copyDialogContent, onCopy] = useCopyGatewayReference()
  let accessory: ReactNode = null
  if (accessoryKey === 'citations') {
    accessory = <EntityCitationsAccessory entityId={accountEntityId} />
  }
  return (
    <>
      <AccessoryLayout accessory={accessory}>
        <MainWrapperNoScroll>
          <MainAccountPage />
        </MainWrapperNoScroll>
      </AccessoryLayout>
      {copyDialogContent}
      <Footer>
        {mentions.data?.mentions?.length ? (
          <FooterButton
            active={accessoryKey === 'citations'}
            label={`${mentions.data?.mentions?.length} ${pluralS(
              mentions.data?.mentions?.length,
              'Citation',
            )}`}
            icon={BlockQuote}
            onPress={() => {
              if (route.accessory?.key === 'citations')
                return replace({...route, accessory: null})
              replace({...route, accessory: {key: 'citations'}})
            }}
          />
        ) : null}
      </Footer>
    </>
  )
}

function MainAccountPage() {
  const route = useNavRoute()

  const accountId = route.key === 'account' && route.accountId
  if (!accountId) throw new Error('Invalid route, no account id')
  const account = useAccountWithDevices(accountId)
  const myAccount = useMyAccount()
  const isMe = myAccount.data?.id === accountId
  const {data: groups} = useAccountGroups(
    route.tab === 'groups' ? accountId : undefined,
  )
  const {data: documents} = useAccountPublicationFullList(
    route.tab === 'documents' ? accountId : undefined,
  )
  const {data: drafts} = useDraftList({})
  const allDocs = useMemo(() => {
    if (route.tab !== 'documents') return []
    const allPubIds = new Set<string>()
    if (!documents) return []
    const docs = documents.map((d) => {
      if (d.publication?.document?.id)
        allPubIds.add(d.publication?.document?.id)
      return {key: 'publication', ...d}
    })
    if (!isMe) return docs
    const newDrafts = drafts.documents
      .filter((d) => !allPubIds.has(d.id))
      .map((d) => ({key: 'draft', document: d}))
    return [...newDrafts, ...docs]
  }, [isMe, route.tab, drafts, documents])
  const [copyDialogContent, onCopyId] = useCopyGatewayReference()
  const scrollRef = React.useRef<VirtuosoHandle>(null)

  let items: Array<
    | 'profile'
    | Event
    | ListAccountGroupsResponse_Item
    | {
        key: 'publication'
        publication: HMPublication
        author: HMAccount | undefined
        editors: (HMAccount | undefined)[]
      }
    | {
        key: 'draft'
        document: HMDocument
      }
  > = ['profile']
  const feed = useResourceFeedWithLatest(
    route.tab === 'activity' ? hmId('a', accountId).qid : undefined,
  )
  if (route.tab === 'groups') {
    items = groups?.items || []
  } else if (route.tab === 'documents') {
    items = allDocs || []
  } else if (route.tab === 'activity') {
    items = feed.data || []
  }
  const {content: deleteDialog, open: openDelete} = useDeleteDialog()
  const navigate = useNavigate()
  return (
    <>
      <List
        ref={scrollRef}
        header={<AccountPageHeader />}
        footer={
          route.tab === 'activity' ? <FeedPageFooter feedQuery={feed} /> : null
        }
        items={items}
        onEndReached={() => {
          if (route.tab === 'activity') feed.fetchNextPage()
        }}
        renderItem={({item}) => {
          if (item === 'profile') {
            return <ProfileDoc />
          }
          if (item.group) {
            return (
              <GroupListItem
                group={item.group}
                onCopy={() => {
                  const groupId = unpackHmId(item?.group?.id)
                  if (!groupId) return
                  onCopyId(groupId)
                }}
                onDelete={() => {
                  if (!item.group) return
                  openDelete({
                    id: item.group.id,
                    title: item.group.title,
                  })
                }}
                key={item.group.id}
              />
            )
          } else if (item.publication && item.publication?.document?.id) {
            const docId = item.publication.document?.id
            return (
              <PublicationListItem
                key={docId}
                publication={item.publication}
                author={item.author}
                editors={item.editors}
                hasDraft={drafts.documents.find((d) => d.id === docId)}
                menuItems={() => [
                  copyLinkMenuItem(() => {
                    const id = unpackDocId(docId)
                    if (!id) return
                    onCopyId({
                      ...id,
                      version: item.publication.version || null,
                      variants: [{key: 'author', author: accountId}],
                    })
                  }, 'Publication'),
                  {
                    label: 'Delete Publication',
                    key: 'delete',
                    icon: Trash,
                    onPress: () => {
                      openDelete({
                        id: docId,
                        title: item.publication.document?.title,
                      })
                    },
                  },
                ]}
                openRoute={{
                  key: 'publication',
                  documentId: docId,
                  versionId: item.publication.version,
                  variants: [
                    {
                      key: 'author',
                      author: accountId,
                    },
                  ],
                }}
              />
            )
          } else if (item instanceof Event) {
            return <FeedItem event={item} />
          } else if (item.key === 'draft') {
            return (
              <ListItem
                title={getDocumentTitle(item.document)}
                onPress={() => {
                  navigate({
                    key: 'draft',
                    draftId: item.document.id,
                    variant: null,
                  })
                }}
                theme="yellow"
                backgroundColor="$color3"
                accessory={
                  <Button disabled onPress={(e) => {}} size="$1">
                    Draft
                  </Button>
                }
              />
            )
            return <SizableText>{item.document.title}</SizableText>
          }
          console.log('unrecognized item', item)
        }}
      />
      {deleteDialog}
      {route.tab === 'activity' && feed.hasNewItems && (
        <NewUpdatesButton
          onPress={() => {
            scrollRef.current?.scrollTo({top: 0})
            feed.refetch()
          }}
        />
      )}
    </>
  )
}

function AccountPageHeader() {
  const route = useNavRoute()
  const replace = useNavigate('replace')
  const accountId = route.key === 'account' && route.accountId
  if (!accountId) throw new Error('Invalid route, no account id')
  const account = useAccountWithDevices(accountId)
  const myAccount = useMyAccount()
  const connectedCount = account.devices?.filter((device) => device.isConnected)
    .length
  const isConnected = !!connectedCount
  const isMe = myAccount.data?.id === accountId
  const accountEntityUrl = createHmId('a', accountId)
  return (
    <>
      <PageContainer marginTop="$6">
        <Section
          paddingVertical={0}
          gap="$2"
          marginBottom={route.tab !== 'profile' ? '$4' : undefined}
        >
          <XStack gap="$4" alignItems="center" justifyContent="space-between">
            <XStack gap="$4" alignItems="center">
              <Avatar
                id={accountId}
                size={60}
                label={account.profile?.alias}
                url={getAvatarUrl(account.profile?.avatar)}
              />
              <SizableText
                whiteSpace="nowrap"
                overflow="hidden"
                textOverflow="ellipsis"
                size="$5"
                fontWeight="700"
              >
                {getAccountName(account.profile)}
              </SizableText>
            </XStack>

            <XStack space="$2">
              {isMe ? null : <FavoriteButton url={accountEntityUrl} />}
              <CopyReferenceButton />
              <Popover placement="bottom-end">
                <Popover.Trigger asChild>
                  <Button
                    icon={
                      isMe ? null : <OnlineIndicator online={isConnected} />
                    }
                    iconAfter={ChevronDown}
                    size="$2"
                  >
                    {isMe
                      ? 'My Devices'
                      : isConnected
                      ? 'Connected'
                      : 'Offline'}
                  </Button>
                </Popover.Trigger>
                <Popover.Content
                  padding={0}
                  elevation="$2"
                  enterStyle={{y: -10, opacity: 0}}
                  exitStyle={{y: -10, opacity: 0}}
                  elevate
                  animation={[
                    'fast',
                    {
                      opacity: {
                        overshootClamping: true,
                      },
                    },
                  ]}
                >
                  <YGroup>
                    <YGroup.Item>
                      <XStack paddingHorizontal="$4">
                        <MenuItem
                          disabled
                          title={pluralizer(account.devices.length, 'Device')}
                          size="$1"
                          fontWeight="700"
                        />
                      </XStack>
                    </YGroup.Item>
                    {account.devices.map((device) => {
                      if (!device) return null
                      return (
                        <DeviceRow
                          key={device.deviceId}
                          isOnline={device.isConnected}
                          deviceId={device.deviceId}
                        />
                      )
                    })}
                  </YGroup>
                </Popover.Content>
              </Popover>

              {isMe ? null : (
                <AccountTrustButton
                  accountId={accountId}
                  isTrusted={account.isTrusted}
                />
              )}
            </XStack>
          </XStack>
          <XStack>
            <RadioButtons
              key={route.tab}
              value={route.tab || 'profile'}
              options={[
                {key: 'profile', label: 'Profile'},
                {key: 'groups', label: 'Groups'},
                {key: 'documents', label: 'Documents'},
                {key: 'activity', label: 'Activity'},
              ]}
              onValue={(tab) => {
                replace({...route, tab})
              }}
            />
          </XStack>
        </Section>
      </PageContainer>
    </>
  )
}

function ProfileDoc({}: {}) {
  const route = useNavRoute()
  const accountRoute = route.key === 'account' ? route : undefined
  if (!accountRoute) throw new Error('Invalid route, no account id')
  const account = useAccount(accountRoute.accountId)
  const pub = usePublication({
    id: account.data?.profile?.rootDocument,
  })
  if (!account.data?.profile?.rootDocument)
    return (
      <PageContainer marginTop="$6">
        <SizableText size="$4" fontFamily="$editorBody" marginTop="$5">
          {account.data?.profile?.bio}
        </SizableText>
      </PageContainer>
    )

  const pubDataWithHeading =
    pub.data?.document?.title &&
    account.data?.profile?.alias !== pub.data?.document?.title
      ? {
          ...pub.data,
          document: {
            ...pub.data.document,
            children: [
              {
                block: {
                  type: 'heading',
                  text: pub.data.document.title,
                },
                children: pub.data.document.children,
              },
            ],
          },
        }
      : pub.data

  return pub.status == 'success' && pub.data ? (
    <PageContainer>
      <AppPublicationContentProvider
        routeParams={{blockRef: accountRoute?.blockId}}
      >
        <PublicationContent
          publication={pubDataWithHeading}
          focusBlockId={
            accountRoute?.isBlockFocused ? accountRoute.blockId : undefined
          }
        />
      </AppPublicationContentProvider>
    </PageContainer>
  ) : (
    <View height={1} />
  )
}

export function RemoveProfileDocDialog({
  onClose,
  input,
}: {
  onClose: () => void
  input: {}
}) {
  const setProfile = useSetProfile({
    onSuccess: onClose,
  })
  return (
    <YStack space backgroundColor="$background" padding="$4" borderRadius="$3">
      <AlertDialog.Title>Remove Profile Document</AlertDialog.Title>
      <AlertDialog.Description>
        Unlink this document from your profile? This will remove all your
        profile's organization.
      </AlertDialog.Description>
      <Spinner opacity={setProfile.isLoading ? 1 : 0} />
      <XStack space="$3" justifyContent="flex-end">
        <AlertDialog.Cancel asChild>
          <Button
            onPress={() => {
              onClose()
            }}
            chromeless
          >
            Cancel
          </Button>
        </AlertDialog.Cancel>
        <AlertDialog.Action asChild>
          <Button
            theme="red"
            onPress={() => {
              setProfile.mutate({
                rootDocument: '',
              })
              onClose()
            }}
          >
            Remove
          </Button>
        </AlertDialog.Action>
      </XStack>
    </YStack>
  )
}
