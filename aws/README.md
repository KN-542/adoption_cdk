## CDK

### CDKToolKit 作成

```
cdk bootstrap
```

### Stack 作成

```
npx cdk deploy AdoptionStack
```

### Stack 削除

```
npx cdk destroy AdoptionStack
```

## git clone

```
git config --global user.name "your_name"
git config --global user.email "your_email"
aws configure
    Access key: AKIA4QIH6AYESDGMAHGB
    Secret key: 個別に聞いてください
    region: ap-northeast-1
    format: json
git config --global credential.helper '!aws codecommit credential-helper $@'
git config --global credential.UseHttpPath true
git clone https://git-codecommit.ap-northeast-1.amazonaws.com/v1/repos/adoption_docker
git clone --branch main https://git-codecommit.ap-northeast-1.amazonaws.com/v1/repos/adoption_go
git clone https://git-codecommit.ap-northeast-1.amazonaws.com/v1/repos/adoption_nextjs
git clone https://git-codecommit.ap-northeast-1.amazonaws.com/v1/repos/applicant_nextjs
```
