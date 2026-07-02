import boto3
from pipeline import config

def list_source_keys_from_pages(pages):
    keys = []
    for page in pages:
        for obj in page.get("Contents", []):
            k = obj["Key"]
            if k.lower().endswith(".mp4"):
                keys.append(k)
    return keys

def list_source_keys(s3=None):
    s3 = s3 or boto3.client("s3", region_name=config.REGION)
    paginator = s3.get_paginator("list_objects_v2")
    pages = paginator.paginate(Bucket=config.BUCKET, Prefix=config.SRC_PREFIX + "/")
    return list_source_keys_from_pages(pages)

def presign(key, s3=None, expires=6 * 3600):
    s3 = s3 or boto3.client("s3", region_name=config.REGION)
    return s3.generate_presigned_url("get_object",
        Params={"Bucket": config.BUCKET, "Key": key}, ExpiresIn=expires)
