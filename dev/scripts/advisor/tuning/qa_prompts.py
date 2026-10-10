"""One-pass and two-stage prompts share the same evidence and abstention rules."""
def context(row):
    text = row["context"]
    if len(text) <= 1300: return text
    sentence = row.get("sourceSentence", "")
    location = text.find(sentence) if row["answerable"] else -1
    if location < 0: return text[:1300]
    return text[:text.find("\n") + 1] + text[max(text.find("\n") + 1, location - 100):location + len(sentence) + 150]


def messages(row, task="answer"):
    instruction = {
        "answer": "Use only the document. Copy the requested number and unit exactly, with no explanation. If absent, output NOT_FOUND.",
        "route": "Does the document contain the exact requested information? Answer only YES or NO. A similar number is insufficient.",
        "extract": "The document contains the answer. Copy only the requested number and unit exactly. If absent, output NOT_FOUND.",
    }[task]
    return [{"role": "system", "content": instruction},
            {"role": "user", "content": f"Document:\n{context(row)}\n\nQuestion: {row['question']}"}]


def prompt_ids(tokenizer, row, task="answer"):
    return tokenizer.apply_chat_template(messages(row, task), tokenize=True,
        add_generation_prompt=True, enable_thinking=False, return_dict=False)


def exact_answer(text):
    # Formatting whitespace is ignored; digits, punctuation, and units are untouched.
    return text.strip()
