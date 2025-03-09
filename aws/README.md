## CDK

### CDKToolKit 作成

```
cdk bootstrap
```

### Stack 作成

```
npx cdk deploy スタック名
```

### Stack 削除

```
npx cdk destroy スタック名
```

## Secrets Manager 中身確認

```
aws secretsmanager get-secret-value --secret-id [SECRET_ID]
```
