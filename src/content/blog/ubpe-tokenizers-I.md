---
title: 'UBPE Tokenizers. Creating a BPE tokenier from scratch. Part 1'
description: 'Guide to creating a byte-pair encoding tokenizer from scratch'
pubDate: 'Sep 26 2025'
---

When writing my master's thesis I thought it would be a great idea to compress a 1D signal by tokenizing it. Storing and transferring the compressed signal together with the tokenizer's vocabulary should be much cheaper than the long signal itself, right? The problem was that all guides and packages I found are specializing on text tokenization. So I decided to create my own.

# Idea of the algorithm

Byte-pair encoding is a popular text tokenization method. It's proposed to recursively substitute the most popular token pairs with a single one. The logic is simple: text can be represented as a sequence of code points in general or characters in simpler case, and each code point can be represented as a sequence of bytes. This representation is redundant and too expensive for machine learning models. So the byte sequence can be compressed a lot. First few steps of substitution process will group bytes into code points, then code points into characters, characters into syllables, n-grams, words, and even in popular phrases. The token's vocabulary obtained will highly rely on the frequency of each byte subsequence in the corpus, so it is more natural than other mentioned methods.

As the algorithm described below primary was a solution to my problem (tokenization of signals -- large sequences of whole numbers), the described algorithm has several differences from the original. The signals I wanted to tokenize consist of float numbers from some range, that can be mapped on a range of whole numbers, and the range should be pretty big to have little discretization steps. For tokenizer this means that I have a very big initial alphabet (which is byte-long (256) in original method). Moreover, these signals differ from texts in their nature: due to the way the signal is recorded and written as a sequence of integers there can not be words, only subsequences that can look alike.

> Though UBPE is designed for general sequences, it works well on texts too.

# UBPE -- Universal Byte-Pair Encoding

> The algorithm assumes that you know all possible elements -- alphabet -- that can be seen in the corpus. You should either provide an alphabet dict (element to `[0..alphabet_size)` mapping) for texts or if you want a custom mapping, or just `alphabet_size` if the elements are already in `[0..alphabet_size)`.

Now let's build the tokenizer. First, we should substitute original elements with initial tokens from the alphabet.

```python
corpus = [[alphabet[letter] for letter in doc] for doc in corpus]
```

Second, in the main building loop, we should find all pairs of adjacent tokens in our corpus. The easiest way to do it is using `itertools`:

```python
pairs = [itertools.pairwise(doc) for doc in corpus]
```

Here is a room for optimization. We need to find the most frequent pair of tokens. The most pythonic way to do this is using `Counter`:

```python
mc = Counter(itertools.chain(*pairs)).most_common(1)
```

Okay, the most frequent ONE. Having 256 (byte-size) elements in alphabet and finding only one new token each step is very time-consuming. Can we do it more efficient? Yes. Will we get new problems to solve? Also yes. Let's say we want to add more than one token at a time, for example, `n_candidates`:

```python
mc = Counter(itertools.chain(*pairs)).most_common(n_candidates)
```

Now, the first problem. From a sequence `..., t0, t1, t2, t3, ...` we can have pairs `(t0, t1)`, `(t1, t2)`, `(t2, t3)` in `mc`. After substituting `(t0, t1)` with a new token, we don't have `(t1, t2)` here anymore, but still have `(t2, t3)`. If we start with `(t1, t2)` instead, `(t0, t1)` and `(t2, t3)` couldn't be found anymore. So we should filter `mc` to not have collisions. Here is how to do it:

```python
# rewrite how we build pairs and find most common
pairs = [itertools.pairwise(doc) for doc in corpus]
pairs_counter = Counter(itertools.chain(*pairs))
mc = pairs_counter.most_common(n_candidates)

# filter candidates
## first candidate is always added
token_pairs = [mc[0]]
## each old token may occure only in one candidate
current_set = set(mc[0][0])
for i in range(1, n_candidates):
    if len(current_set.intersection(mc[i][0])) != 0:
        continue

    ## check that border pairs are not better
    (l2, r2), n2 = mc[i]
    good_to_add = True
    for (l1, r1), _ in token_pairs:
        good_to_add = (
            pairs_counter[(r2, l1)] < n2 and pairs_counter[(r1, l2)] < n2
        )
        if not good_to_add:
            break

    ## finally add candidate if it is good
    if good_to_add:
        token_pairs.append(mc[i])
        current_set.update(mc[i][0])
```

And now we have the second problem. Let's say we want to have `n_tokens` in our tokenizer, including that from the alphabet. Moreover, we want more valuable artificial (not from the alphabet) tokens have lower values. When adding several candidates at once we still preserve the order between these candidates, but not between all new tokens. Then, at the end of the building process we can accidentally generate slightly more than `n_tokens`. To later rearrange the tokens and trim vocabulary to the specified size we should weight tokens somehow. From the NLP we get a wonderful metric: idf -- inverse document frequency, which is a part of tf-idf metric. 

Now we can add new tokens. Before the main loop we should find the last token number in the alphabet and initialize two dictionaries -- one for mapping and one for weights:

```python
tokens_mapper = {
    # subsequences of tokens to a single token
    "forward": dict(),
    # single token to a subsequence of tokens
    "backward": dict(),
}
# number of occurrences of each token
tokens_weights = dict()
# the first token to be added to the mapping minus one
max_token = alphabet_size - 1
```

Generate new tokens for classical recursive substitution on inference:

```python
# dict to pass as a parameter to pair substitution function
mini_mapping = dict() 
for tokens_map, _ in token_pairs:
    # unpack pair of tokens
    (t1, t2) = tokens_map 
    # find the value of the new token
    max_token += 1
    # compute its idf
    tokens_weights[max_token] = log(
        (1 + len(corpus))
        / (1 + sum(1 for doc in pairs if tokens_map in doc))
    )
    
    tokens_mapper["backward"][max_token] = tokens_map
    tokens_mapper["forward"][tokens_map] = max_token
    
    # enclose `max_token` into a list once, needed for efficient substitution
    mini_mapping[t1] = (t2, [max_token])
```

We can slightly modify this loop to find a direct mapping between artificial and alphabet tokens:

```python
# dict to pass as a parameter to pair substitution function
mini_mapping = dict() 
for tokens_map, _ in token_pairs:
    # unpack pair of tokens
    (t1, t2) = tokens_map 
    # find the value of the new token
    max_token += 1
    # compute its idf
    tokens_weights[max_token] = log(
        (1 + len(corpus))
        / (1 + sum(1 for doc in pairs if tokens_map in doc))
    )
    
    tokens_map = tokens_mapper["backward"].get(
        t1, (t1,)
    ) + tokens_mapper["backward"].get(t2, (t2,))
    tokens_mapper["backward"][max_token] = tokens_map
    tokens_mapper["forward"][tokens_map] = max_token
    
    # enclose `max_token` into a list once, needed for efficient substitution
    mini_mapping[t1] = (t2, [max_token]) 
```

And the final step of the main building loop is to substitute found pairs with artificial tokens in the `corpus`:

```python
def replace_token_pairs(self, l, sub):
    # optimization to check if the element is a start of token pair
    # not in O(n) but in O(1) with a small dict
    is_not_start = {key: False for key in list(sub.keys())}
    i = -1
    while i < len(l) - 2:
        i += 1
        if is_not_start.get(l[i], True):
            continue
        start = l[i]
        if l[i + 1] == sub[start][0]:
            l[i : i + 2] = sub[start][1]
    return l

corpus = [
    replace_token_pairs(corpus[i], mini_mapping)
    for i in range(len(corpus))
]
```

## Optional: Rearrange tokens and trim vocabulary

Let's describe an algorithm for rarranging.

1. Sort backward mapping according to tokens weights from lowest to highest:
```python
buf = sorted(
    list(tokens_mapper["backward"].items()),
    key=lambda item: tokens_weights[item[0]],
)
```

2. Trim vocabulary
```python
# find indecies in `buf` to delete
to_delete: list[int] = []
for i in range(len(buf)):
    if i in to_delete:
        continue
    if len(to_delete) >= len(tokens_weights) - n_tokens + s alphabet_size:
        break
    to_delete.append(i)

    # this may seem redundant, but with large `n_candidates` it may be useful
    token = buf[i][0]
    for j in range(i + 1, len(buf)):
        if token in buf[j][1]:
            to_delete.append(j)
# cange raw indecis to actual token's values
to_delete = [buf[i][0] for i in to_delete]
# reverse list to be sorted from highest value to lowest
buf = buf[::-1]
```

3. Create a transformer, that will map old token's values into new (ordered) ones:
```python
transformer = {buf[i][0]: alphabet_size + i for i in range(len(buf))}
```

4. Finally, recompute `tokens_weights` and `tokens_mapper`:
```python
tokens_weights = {
    transformer[pair[0]]: tokens_weights[pair[0]]
    for pair in buf
    if pair[0] not in to_delete
}

tokens_mapper = {
    "forward": dict(
        sorted(
            [
                (
                    tuple(transformer.get(t, t) for t in seq),
                    transformer.get(token, token),
                )
                for seq, token in tokens_mapper["forward"].items()
                        if token not in to_delete
            ],
            key=lambda item: item[1],
        )
    ),
    "backward": dict(
        sorted(
            [
                (
                    transformer.get(token, token),
                    tuple(transformer.get(t, t) for t in seq)
                )
                for token, seq in tokens_mapper["backward"].items()
                if token not in to_delete
            ],
            key=lambda item: item[0],
        )
    ),
}
```

# Conclusion

In this article we described how to create byte-pair tokenizer from scratch with some optimizations. In the next article we will discuss how to use it for encoding the initial sequences into sequences of tokens and decode them back.

> The algorithm is published as a package on PyPI and can be installed via [`pip install ubpe[native]`](https://pypi.org/project/ubpe/).

> P.S. the package is splitted into realizations and wrapper for import, now only `ubpe-native` is available as the `native` feature of `ubpe`.