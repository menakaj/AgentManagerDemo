import { SAMPLE_PROMPTS } from "../data/samplePrompts.js";

export default function PromptChips({ onPick, disabled, riskyTitle }) {
  return (
    <div className="prompt-chips" aria-label="Sample prompts">
      {SAMPLE_PROMPTS.map(({ text, risky }) => (
        <button
          key={text}
          type="button"
          className={"chip" + (risky ? " risky" : "")}
          title={risky ? riskyTitle : text}
          disabled={disabled}
          onClick={() => onPick(text)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
