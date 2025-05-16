import {
  APIInteractionResponse,
  APIMessageComponentButtonInteraction,
  APIMessageComponentInteraction,
  APIMessageComponentSelectMenuInteraction,
  APIModalSubmitInteraction,
} from "discord-api-types/v10";
import { addScheduleEventsCallback } from "./commands/calendar";
import { reopenModalFromStateCallback } from "./commands/modal";
import {
  deleteNotificationsMirrorCallback,
  mirrorTemplateHelpCallback,
  notificationsEnterDefaultSettings,
  notificationsEnterMirrorSettings,
  notificationsMirrorModalCallback,
  selectNotificationFeaturesCallback,
  selectNotificationMirrorChannelsCallback,
  selectNotificationMirrorFeatureCallback,
  selectNotificationMirrorTeamCallback,
  selectNotificationTeamCallback,
  toggleNotificationActiveButtonCallback,
} from "./commands/notifications";
import {
  selectPickemsChannelCallback,
  selectPickemsTeamCallback,
  togglePickemsActiveButtonCallback,
} from "./commands/pickemsConfig";
import {
  pickemsPurgeCancelCallback,
  pickemsPurgeConfirmCallback,
} from "./commands/pickemsLeaderboard";
import { playerSearchSelectCallback } from "./commands/player";
import { InteractionContext } from "./interactions";

export interface MinimumKVComponentState {
  /** The total number of seconds that the component/modal should be stored. */
  componentTimeout: number;
  /** Where the server should look for a registered callback in the
   * component/modal store. */
  componentRoutingId: StorableRoutingId;
  /** If `true`, the handler will no longer be called after its
   * first successful response. This is not immune to race conditions, e.g.
   * two users pressing a button at the same time. */
  componentOnce?: boolean;
}

export type ComponentCallbackT<T extends APIMessageComponentInteraction> = (
  ctx: InteractionContext<T>,
) => Promise<
  APIInteractionResponse | [APIInteractionResponse, () => Promise<void>]
>;
export type ButtonCallback =
  ComponentCallbackT<APIMessageComponentButtonInteraction>;
export type SelectMenuCallback =
  ComponentCallbackT<APIMessageComponentSelectMenuInteraction>;
export type ModalCallback = (
  ctx: InteractionContext<APIModalSubmitInteraction>,
) => Promise<
  APIInteractionResponse | [APIInteractionResponse, () => Promise<void>]
>;

export type ComponentCallback = ButtonCallback | SelectMenuCallback;

export type StoredComponentData = { handler: ComponentCallback };
export type StoredModalData = { handler: ModalCallback };

export type ModalRoutingId = "select-notifications-mirror-modal";

export type ComponentRoutingId =
  // temporary
  | "player-search"
  | "add-schedule-events"
  | "select-notifications-teams"
  | "select-notifications-features"
  | "select-notifications-activate-toggle"
  | "select-notifications-mirror-settings"
  | "select-notifications-default-settings"
  | "select-notifications-mirror-team"
  | "select-notifications-mirror-feature"
  | "select-notifications-mirror-channels"
  | "delete-notifications-mirror"
  | "reopen-modal"
  | "select-pickems-teams"
  | "select-pickems-channel"
  | "select-pickems-activate-toggle"
  | "pickems-purge-confirm"
  | "pickems-purge-cancel"
  // persistent
  | "mirror-template-help";

export type StorableRoutingId = ComponentRoutingId | ModalRoutingId;

export const componentStore: Record<ComponentRoutingId, StoredComponentData> = {
  "reopen-modal": { handler: reopenModalFromStateCallback },
  "player-search": { handler: playerSearchSelectCallback },
  "add-schedule-events": { handler: addScheduleEventsCallback },
  "select-notifications-teams": { handler: selectNotificationTeamCallback },
  "select-notifications-features": {
    handler: selectNotificationFeaturesCallback,
  },
  "select-notifications-activate-toggle": {
    handler: toggleNotificationActiveButtonCallback,
  },
  "select-notifications-default-settings": {
    handler: notificationsEnterDefaultSettings,
  },
  "select-notifications-mirror-settings": {
    handler: notificationsEnterMirrorSettings,
  },
  "select-notifications-mirror-team": {
    handler: selectNotificationMirrorTeamCallback,
  },
  "select-notifications-mirror-feature": {
    handler: selectNotificationMirrorFeatureCallback,
  },
  "select-notifications-mirror-channels": {
    handler: selectNotificationMirrorChannelsCallback,
  },
  "delete-notifications-mirror": {
    handler: deleteNotificationsMirrorCallback,
  },
  "select-pickems-teams": { handler: selectPickemsTeamCallback },
  "select-pickems-channel": { handler: selectPickemsChannelCallback },
  "select-pickems-activate-toggle": {
    handler: togglePickemsActiveButtonCallback,
  },
  "pickems-purge-confirm": { handler: pickemsPurgeConfirmCallback },
  "pickems-purge-cancel": { handler: pickemsPurgeCancelCallback },
  // persistent
  "mirror-template-help": { handler: mirrorTemplateHelpCallback },
};

export const modalStore: Record<ModalRoutingId, StoredModalData> = {
  "select-notifications-mirror-modal": {
    handler: notificationsMirrorModalCallback,
  },
};
