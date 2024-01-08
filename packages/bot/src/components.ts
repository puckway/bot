import {
  APIInteractionResponse,
  APIMessageComponentButtonInteraction,
  APIMessageComponentInteraction,
  APIMessageComponentSelectMenuInteraction,
  APIModalSubmitInteraction,
} from "discord-api-types/v10";
import { InteractionContext } from "./interactions";
import { khlPlayerSearchSelectCallback } from "./commands/player";

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

export type ModalRoutingId = "";

export type ComponentRoutingId = "player-search";

export type StorableRoutingId = ComponentRoutingId | ModalRoutingId;

export const componentStore: Record<ComponentRoutingId, StoredComponentData> = {
  "player-search": { handler: khlPlayerSearchSelectCallback },
};

export const modalStore: Record<string, StoredModalData> = {};
