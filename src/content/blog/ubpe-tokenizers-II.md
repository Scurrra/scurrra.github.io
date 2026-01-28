---
title: 'UBPE Tokenizers. Creating a BPE tokenizer from scratch. Part 2'
description: 'Guide to creating a byte-pair encoding tokenizer from scratch'
pubDate: 'Sep 26 2025'
updatedDate: 'Jan 25 2026'
---

> [Medium.com edition](https://medium.com/@iljabarouski/ubpe-tokenizers-creating-a-bpe-tokenizer-from-scratch-part-2-8f26aa9a1b04)

> For tokenizer fitting algorithm see [the 1st part](https://scurrra.github.io/blog/ubpe-tokenizers-i/).

In this part I will describe how to encode sequences using the fitted tokenizer and decode them back.

# Classic UBPE

As stated in the previous part, classic realization of algorithm uses the mapping between pairs of adjacent tokens and new artificial tokens, and these artificial tokens may also be contained in pairs for sustitution.

## Encoding

In classic variant we are forced to use recursive algorithm for encoding: on each step substitute the most valuable pair of tokens from the vocabulary with the new token. With this approach the mapping between original sequence and encoded is bijection.

The algorithm has a future-problem-free optimization: we can substitute several pairs of tokens at a single step, keeping in mind that each token may occur in only one pair.

> It is useful to prepare and store a list of just pairs (keys from mapping) separately to not compute it on each call of encode function.

```python
# just pars of tokens from the mapper
token_pairs = list(tokens_mapper["forward"].keys())

# substitute elements of sequence with alphabet tokens
doc = [alphabet[token] for token in doc]

while True:
    # set of adjacent pairs in the doc
    pairs = set(itertools.pairwise(doc))

    # find the most valuable pair of tokens to substitute
    i = 0
    while i < len(token_pairs) and token_pairs[i] not in pairs:
        i += 1
    # if no known pairs of tokens found, the sequence is encoded
    if i == len(token_pairs):
        break
    tokens = [token_pairs[i]]

    # each token can occur in only one pair of tokens 
    # to substitute at a single step
    current_set = set(tokens[-1])

    # find less valuable pairs of tokens that can be substituted 
    # at the same step
    for j in range(i + 1, len(token_pairs)):
        if len(current_set.intersection(token_pairs[j])) != 0:
            break
        if token_pairs[j] in pairs:
            tokens.append(token_pairs[j])
            current_set.update(token_pairs[j])

    # build a mapping for substitution
    mini_mapping = {
        pair[0]: (pair[1], [tokens_mapper["forward"][pair]])
        for pair in tokens
    }
    # and replace
    doc = replace_token_pairs(doc, mini_mapping)
```

## Decoding

As we have an initial `alphabet`, that is used to obtain an inner representation of a sequence, we also need an `inverse_alphabet` to map this representation back:

```python
inverse_alphabet = {value: key for key, value in alphabet.items()}
```

The decoding process itself is very simple: if the token is an artificial one, it is replaced with a pair of tokens and the index is not changed to be able to substitute the first token from the pair if needed; if the token is from the alphabet, it is kept and the index is increased by one.

```python
i = 0
while i < len(tokens):
    if tokens[i] in tokens_mapper["backward"]:
        tokens[i : i + 1] = tokens_mapper["backward"][tokens[i]]  
    else:
        i += 1
tokens = [inverse_alphabet[token] for token in tokens]
```

# Universal BPE

When fitting the tokenizer, one can keep not the recursive mapping, but mapping between subsequences of different lengths and artificial tokens. The representation is more straightforward than the classic one, but is more complex for encoding.

> The representation can be obtained after fitting by recursively decoding pairs from the classic mapping.

## Encoding

To encode the sequence we should find subsequences of different lengths in the original sequences. Well, it's not that easy, but the solution provides several benefits. Let's take a look at it!

> When you have a string and the task is to find random substrings in it, you should build a postfix tree from this string and search strings in this tree. If you have a known set of substrings, and you search for these substrings in different strings, you can build a prefix tree (or its optimized version, like radix tree) -- a data structure that can be used in key-value storage, where keys are sequences of some kind (like strings or tuples) -- and from each position in a string search for substrings of variable lengths that start from this position in the tree.

At the end of the fitting process you should build the radix tree from the reverse alphabet and the forward mapping. Growing a tree is a pretty expensive operation, so better do it once and reuse.

```python
lookup = Root[tuple[int], int]()
for key in inverse_alphabet.keys():
    _ = lookup + ((key,), key)
for key, value in tokens_mapper["forward"].items():
    _ = lookup + (key, value)
```

> The implementation of the tree can be found [here](https://github.com/Scurrra/ubpe-native/blob/master/ubpe_native/utils.py).

Now, let's discuss an encoding algorithm:
    1. Like in classic, obtain an inner representation of a sequence.
```python
# as keys in `lookup` are tuples, `doc` also should be a tuple
doc = tuple(alphabet[token] for token in doc)
```

1. Build the initial search stack: at the beginning of `doc` find all possible subsequences in `lookup`, choose the longest one and proceed searching from the very next element from this subsequence until `doc` ends:
```python
start = 0
stacks = []
while start < len(doc):
    stack = lookup(doc, start)
    stacks.append((start, stack))
    start += len(stack[-1][0])
```

2. Build the graph (directed, without cycles), where all possible paths from the start to the end is a variant of encoded sequence (so it's not a bijection). To do so, on each step we pop the top element from the stack, add each subsequence as edges to the node with value equal to start position of the subsequence, and if the node that starts after the subsequence was not already built, add a lookup result for that position to the stack.

> More correct name for this data structure can be a finite state machine, but the directed graph without cycles is also okay.

```python
nodes = dict()
while len(stacks) != 0:
    start, stack = stacks.pop()
    next = dict()
    for key, value in stack:
        next_key_start = start + len(key)
        next[key] = (value, next_key_start)
        if next_key_start != len(doc) and next_key_start not in nodes:
            stacks.append((next_key_start, lookup(doc, next_key_start)))
    nodes[start] = next
```

The redundant step: delete hanging nodes. In each node delete edges that do not point to any other nodes, and delete the node itself if it does not have any outgoing edges. The step is redundant because of that `lookup` contains `alphabet` itself the initial `doc` can be considered as an encoded version of itself. 
```python
nodes_to_delete: list[int] = []
for node_start, node in nodes.items():
    keys_to_delete: list[tuple[int, ...]] = []
    for key, (_, start) in node.items():
        if start != len(doc) and start not in nodes:
            keys_to_delete.append(key)
    for key in keys_to_delete:
        del node[key]
    if len(node) == 0:
        nodes_to_delete.append(node_start)
for start in nodes_to_delete:
    del nodes[start]
```

3. The final step is to find all possible paths. Actually, no one ever should search for all paths, but for `top_n`, which is `1` by default. Top paths, or most valuable ones are that with highest tf-idf metric (this is why `tokens_weights` are idfs of tokens). As stated above, `nodes` is very big as it contains all possible paths, and it can not be reduced without possible losses. Traversal of `nodes` with recursion exceeds depth limits, so the only way is to dynamically build paths from the end and keep `top_n` paths from each start.
```python
# starts of each node, but from the end
starts = sorted(nodes.keys(), reverse=True)
# list of at most `top_n` sequences from start positions 
# together with its tf-idf and tokens Counter 
# for faster computing of term frequencies; at the end 
# we have an empty subsequence with zero weight and empty counter 
tails = {len(doc): [(0, [], Counter([]))]}
for start in starts:
    # candidates for the element of `tails` at `start`
    buf = []
    # check all nodes from the end
    # for each edge from the node
    for token, next_start in nodes[start].values():
        # for each tail after the edge
        for _, tail, counter in tails[next_start]:
            # compute the new tail
            buf_element = [token] + tail.copy()
            # update the counter
            buf_counter = counter.copy()
            buf_counter.update([token])
            # and compute the tail's weight -- tf-idf
            buf_weight: float = sum(
                (1 + log(frequency)) * tokens_weights.get(token, 0)
                for token, frequency in buf_counter.items()
            )
            # append the tail to the list of candidates
            buf.append((buf_weight, buf_element, buf_counter))

    # find at most `top_n` most valuable candidate 
    # and add them to `tails`
    buf_n = top_n if top_n <= len(buf) else len(buf)
    tails[start] = sorted(buf, key=lambda item: item[0], reverse=True)[:buf_n]
# candidates for the encoded sequence are tails from the start
candidates = tails[0]
```

> As you see, this approach allows you to choose between multiple variants of encodings. Moreover, comparison with classic approach showed that the novel produces shorter sequences.

> Note: In practice, selection of top `n` elements should be optimized: if `n == 1` only the most valuable candidate is kept during selection, for greater `n` priority queue with limit is utilized for selection. 

## Decoding

As a bonus for complex encoding process, decoding is very simple: initialize the resulting sequence, for each token in the encoded sequence either extend `result` with the subsequence of initial tokens if it's an artificial one, or simply append itself. Finally, map `result` back to original elements using `inverse_alphabet`.

```python
result: list[int] = []
for token in tokens:
    if token in tokens_mapper["backward"]:
        result.extend(tokens_mapper["backward"][token])
    else:
    result.append(token)
result = [inverse_alphabet[token] for token in result]
```

# Conclusion

The novel approach can be used to find *better* encodings of the sequences, or if one wants to choose between different variants of encodings and knows how to do it.

> The algorithm is published as a package on PyPI and can be installed via [`pip install ubpe[native]`](https://pypi.org/project/ubpe/).

> P.S. the package is splitted into realizations and wrapper for import, now only [`ubpe-native`](https://github.com/Scurrra/ubpe-native) is available as the `native` feature of [`ubpe`](https://github.com/Scurrra/ubpe).