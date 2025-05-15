declare module "pope" {
  interface PopeOptions {
    /**
     * Do not replace the undefined values with an empty string.
     *
     * ```js
     * import { pope } from "pope";
     * pope('There are {{0}} emails in your inbox', {}, {
     *   skipUndefined: true
     * });
     * // returns: There are {{0}} emails in your inbox
     * ```
     */
    skipUndefined?: boolean;
    /**
     * Throw an exception when an undefined value is found. `throwOnUndefined`
     * gets priority over `skipUndefined` if both are provided.
     *
     * ```js
     * const { pope } = require('pope')
     * pope('Hello {{ username }}', {}, {
     *   throwOnUndefined: true
     * })
     *
     * // throws exception:
     * {
     *   message: 'Missing value for {{ username }}',
     *   key: 'username',
     *   code: 'E_MISSING_KEY',
     *   stack: '.....'
     * }
     * ```
     */
    throwOnUndefined?: boolean;
  }

  /**
   * Parse a given template string and replace dynamic placeholders with
   * actual data.
   *
   * @param string the template string
   * @param data data to place into the string where indicated
   * @param options interpolation options
   */
  function pope(
    string: string,
    data: Record<string, unknown>,
    options?: PopeOptions,
  ): string;
}
