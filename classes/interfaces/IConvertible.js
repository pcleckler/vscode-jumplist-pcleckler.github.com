/**
 * An interface for creating class instances from JavaScript objects.
 * @interface {IConvertible}
 */
class IConvertible {

    /**
     * Converts an instance of the current class to a JavaScript object representation of that class.
     * @returns {object}
     */
    ConvertToObj() {
        return {};
    }

    /**
     * Determines of a JavaScript object can be used to create an instance of the current class.
     * @param {object} obj The JavaScript object to evaluate.
     * @returns {boolean}
     */
    static CanConvert(obj) {
        return false;
    }

    /**
     * Uses a JavaScript object to create an instance of the current class.
     * @param {object} obj The JavaScript object to use in instance creation.
     * @returns {IConvertible?}
     */
    static ConvertFromObj(obj) {
        return null;
    }
}