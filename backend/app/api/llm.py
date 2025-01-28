from fastapi import APIRouter, HTTPException
from app.services.llm_service import generate_recommendation

router = APIRouter()

@router.post("/recommendation/")
def get_optimization_recommendation(request: dict):
    """
    Generate recommendations using LLM for satellite optimization.
    """
    data = request.get("data", {})
    query = request.get("query", "")
    if not query:
        raise HTTPException(status_code=400, detail="Query is required")
    
    try:
        recommendation = generate_recommendation(data, query)
        return {"recommendation": recommendation}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
