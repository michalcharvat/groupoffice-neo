/**
 * Custom field conditions (ExtJS customfields/type/Text.js checkRequiredCondition()):
 * a field's `relatedFieldCondition` like
 *
 *     "nameOfStandardOrCustomField = test AND (checkbox = 1 OR other is not empty)"
 *
 * makes it required (`conditionallyRequired`) or hides it (`conditionallyHidden`)
 * while it matches. Operands are form field names, either an entity property or a
 * custom field's databaseName; the value runs to the next AND / OR / ")" and may
 * contain spaces. AND binds stronger than OR, as in the ExtJS version that turned the
 * condition into JavaScript. Parsed here instead of evaluated, so a condition can't
 * run code.
 *
 * Comparisons use the form value as text, like ExtJS: = and != compare text, a
 * checkbox is "1" or "0" (so never empty), a select matches its option id or its
 * text. <, >, <= and >= compare numbers when both sides are numbers (ExtJS compared
 * text, so "10" < "9").
 */

// a name may be given as "customFields.<databaseName>", like the form field
const COMPARISON = /^([\w.]+)\s*(==|!=|>=|<=|=|<|>)\s*(.*)$/,
      EMPTY      = /^([\w.]+)\s+is\s+(not\s+)?empty$/i;

/**
 * Splits a condition into tokens: "(", ")", "AND", "OR" and text words
 * @param {String} condition
 * @returns {String[]}
 */
function tokenize(condition) {
    const tokens = [];

    String(condition).trim().split(/\s+/).filter(Boolean).forEach(word => {
        let close = 0;

        while (word.startsWith('(')) {
            tokens.push('(');
            word = word.slice(1)
        }

        while (word.endsWith(')')) {
            close++;
            word = word.slice(0, -1)
        }

        word && tokens.push(word === 'AND' || word === 'OR' ? word : {word});

        for (let i = 0; i < close; i++) {
            tokens.push(')')
        }
    });

    return tokens
}

/**
 * Parses a condition into a tree of {op: 'and'|'or', left, right} and
 * {name, operator, value} / {name, empty: Boolean} nodes
 * @param {String} condition
 * @returns {Object|null} null for an empty condition
 * @throws {Error} when the condition is not well formed
 */
export function parseCondition(condition) {
    const tokens = tokenize(condition || '');
    let pos = 0;

    if (!tokens.length) {
        return null
    }

    const peek = () => tokens[pos];

    function comparison() {
        const words = [];

        while (pos < tokens.length && typeof peek() === 'object') {
            words.push(tokens[pos++].word)
        }

        const text = words.join(' ');
        let match;

        if ((match = EMPTY.exec(text))) {
            return {name: match[1], empty: !match[2]}
        }

        if ((match = COMPARISON.exec(text)) && match[3] !== '') {
            let value = match[3];

            // tolerate a quoted value: "x = 'a b'"
            /^(['"]).*\1$/.test(value) && (value = value.slice(1, -1));

            return {name: match[1], operator: match[2] === '==' ? '=' : match[2], value}
        }

        throw new Error(`Invalid condition near "${text}"`)
    }

    function primary() {
        if (peek() === '(') {
            pos++;
            const node = or();

            if (peek() !== ')') {
                throw new Error('Missing ")"')
            }

            pos++;
            return node
        }

        return comparison()
    }

    function and() {
        let node = primary();

        while (peek() === 'AND') {
            pos++;
            node = {op: 'and', left: node, right: primary()}
        }

        return node
    }

    function or() {
        let node = and();

        while (peek() === 'OR') {
            pos++;
            node = {op: 'or', left: node, right: and()}
        }

        return node
    }

    const tree = or();

    if (pos < tokens.length) {
        throw new Error(`Unexpected "${typeof peek() === 'object' ? peek().word : peek()}"`)
    }

    return tree
}

/**
 * Field names a parsed condition reads
 * @param {Object|null} tree
 * @returns {String[]}
 */
export function conditionFieldNames(tree) {
    if (!tree) {
        return []
    }

    return tree.op ? [...conditionFieldNames(tree.left), ...conditionFieldNames(tree.right)] : [tree.name]
}

const isEmpty = v => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);

const isNumeric = v => v !== '' && v !== null && !isNaN(Number(v));

/**
 * @param {String[]} candidates texts the form value matches (value, display text)
 * @param {String} operator
 * @param {String} expected
 * @returns {Boolean}
 */
function compare(candidates, operator, expected) {
    switch (operator) {
        case '=':
            return candidates.some(c => c === expected);
        case '!=':
            return !compare(candidates, '=', expected);
        default: {
            const actual = candidates[0] ?? '',
                  [a, b] = isNumeric(actual) && isNumeric(expected) ? [Number(actual), Number(expected)] : [actual, expected];

            switch (operator) {
                case '<' : return a < b;
                case '>' : return a > b;
                case '<=': return a <= b;
                case '>=': return a >= b
            }
        }
    }

    return false
}

/**
 * Evaluates a parsed condition
 * @param {Object|null} tree
 * @param {Function} getValue name → {value, texts: String[]}; value decides "is empty",
 *        texts are what a comparison matches
 * @returns {Boolean} false for no condition
 */
export function evaluateCondition(tree, getValue) {
    if (!tree) {
        return false
    }

    if (tree.op === 'and') {
        return evaluateCondition(tree.left, getValue) && evaluateCondition(tree.right, getValue)
    }

    if (tree.op === 'or') {
        return evaluateCondition(tree.left, getValue) || evaluateCondition(tree.right, getValue)
    }

    const {value, texts} = getValue(tree.name);

    if ('empty' in tree) {
        return isEmpty(value) === tree.empty
    }

    return compare(texts, tree.operator, tree.value)
}

/**
 * The value of a form field for a condition, ExtJS getFormValue()
 * @param {Neo.form.field.Base|null} field
 * @param {*} fallback the entity value when the form has no such field
 * @returns {{value: *, texts: String[]}}
 */
export function conditionValue(field, fallback) {
    if (!field) {
        if (typeof fallback === 'boolean') {
            fallback = fallback ? 1 : 0
        }

        return {
            value: fallback,
            texts: isEmpty(fallback) ? [''] : Array.isArray(fallback) ? fallback.map(String) : [String(fallback)]
        }
    }

    let value = field.getSubmitValue();

    if (typeof value === 'boolean') {
        // a checkbox: ExtJS compared 1 / 0
        return {value: value ? 1 : 0, texts: [value ? '1' : '0']}
    }

    const texts   = [],
          display = field.displayField && field.value && typeof field.value === 'object' ? field.value[field.displayField] : null;

    if (Array.isArray(value)) {
        texts.push(...value.map(String))
    } else {
        texts.push(isEmpty(value) ? '' : String(value))
    }

    !isEmpty(display) && texts.push(String(display));

    return {value, texts}
}
