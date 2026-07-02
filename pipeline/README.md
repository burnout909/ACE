# 두통 3-View 처리 파이프라인

## 준비
```
pip install -r requirements.txt
export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_DEFAULT_REGION=ap-northeast-2
```

## 실행
```
python -m pipeline.run --only-pair            # 페어링 리포트만
python -m pipeline.run --workers 3            # 전체: 정렬+인코딩+업로드+매니페스트
python -m pipeline.run --overrides sync_overrides.json   # 수동 오프셋 반영 재실행
```
재실행 시 S3에 이미 있는 산출물은 skip(재개).
