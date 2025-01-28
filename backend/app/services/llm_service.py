import os
import openai

openai.api_key = os.getenv("OPENAI_API_KEY")

def generate_recommendation(data, query):
    """
    Generate recommendations for satellite optimization using OpenAI's GPT.
    """
    prompt = f"""
    You are an expert in satellite optimization. Given the following data:
    {data}
    And the query: {query}
    Provide actionable recommendations.
    """
    response = openai.Completion.create(
        engine="text-davinci-003",
        prompt=prompt,
        max_tokens=300
    )
    return response.choices[0].text.strip()
