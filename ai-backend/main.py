from fastapi import FastAPI, HTTPException
from PIL import Image
import os
import uuid
import shutil
from fastapi import File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from ai_verifier import analyze_complaint, verify_repair, run_ai_workflow

app = FastAPI(title="CivicChain AI Verification API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # during development only
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeComplaintRequest(BaseModel):
    complaint_id: str
    complaint_text: str
    image_path: str


class VerifyRepairRequest(BaseModel):
    complaint_id: str
    complaint_text: str
    before_image_path: str
    after_image_path: str


class WorkflowRequest(BaseModel):
    complaint_id: str
    complaint_text: str
    complaint_image_path: str
    contractor_image_path: str
def save_uploaded_file(file: UploadFile):
    file_extension = os.path.splitext(file.filename)[1]

    if file_extension.lower() not in [".jpg", ".jpeg", ".png"]:
        raise HTTPException(status_code=400, detail="Only JPG, JPEG, and PNG images are allowed")

    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_path = os.path.join("uploads", unique_filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return file_path

def validate_image(file_path):
    try:
        with Image.open(file_path) as img:
            width, height = img.size

            if width < 100 or height < 100:
                raise HTTPException(
                    status_code=400,
                    detail="Image is too small. Minimum size is 100x100 pixels."
                )

            img.verify()

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is not a valid image."
        )
    
@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "CivicChain AI Verifier"
    }


@app.post("/analyze-complaint")
def analyze_complaint_api(request: AnalyzeComplaintRequest):
    try:
        result = analyze_complaint(
            request.complaint_text,
            request.image_path
        )

        return {
            "complaint_id": request.complaint_id,
            "analysis": result
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/verify-repair")
def verify_repair_api(request: VerifyRepairRequest):
    try:
        result = verify_repair(
            request.complaint_text,
            request.before_image_path,
            request.after_image_path
        )

        return {
            "complaint_id": request.complaint_id,
            "verification": result
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/run-workflow-upload")
def run_workflow_upload_api(
    complaint_id: str = Form(...),
    complaint_text: str = Form(...),
    complaint_image: UploadFile = File(...),
    contractor_image: UploadFile = File(...)
):
    try:
        complaint_image_path = save_uploaded_file(complaint_image)
        contractor_image_path = save_uploaded_file(contractor_image)
        validate_image(complaint_image_path)
        validate_image(contractor_image_path)

        result = run_ai_workflow(
            complaint_text,
            complaint_image_path,
            contractor_image_path
        )

        return {
            "complaint_id": complaint_id,
            "uploaded_files": {
                "complaint_image_path": complaint_image_path,
                "contractor_image_path": contractor_image_path
            },
            "result": result
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))